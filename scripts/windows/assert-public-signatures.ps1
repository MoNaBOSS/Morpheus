param(
  [Parameter(Mandatory=$true)][ValidateSet('payload','final')][string]$Stage,
  [Parameter(Mandatory=$true)][string]$ExpectedSource
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($env:OS -ne 'Windows_NT') { throw 'Windows signature verification required.' }
if ([string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) { throw 'Runner temp required for signature inspection.' }
$sourceRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location -LiteralPath $sourceRoot
$policy = Join-Path $PSScriptRoot 'public-release-policy.mjs'
& node $policy --configuration
if ($LASTEXITCODE -ne 0) { throw 'Morpheus signing configuration was rejected.' }
$version = (Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).version
$source = (& git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Unable to bind release source.' }
$changes = @(& git status --porcelain --untracked-files=no)
if ($LASTEXITCODE -ne 0) { throw 'Unable to verify clean release source.' }

function Read-Signature([string]$Role, [string]$Path) {
  $file = Get-Item -LiteralPath $Path
  if ($file.PSIsContainer) { throw "Expected executable for $Role." }
  $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
  $publisher = ''
  if ($null -ne $signature.SignerCertificate) {
    $publisher = $signature.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
  }
  return @{
    role=$Role; status=$signature.Status.ToString(); publisher=$publisher
    timestamped=($null -ne $signature.TimeStamperCertificate)
    sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  }
}

$signatures = @(Read-Signature 'packaged-app' 'release/win-unpacked/Morpheus.exe')
$applicationArchive = (Get-FileHash -LiteralPath 'release/win-unpacked/resources/app.asar' -Algorithm SHA256).Hash.ToLowerInvariant()
$embeddedApplicationArchive = $null
$installedUninstallerEvidence = $null
if ($Stage -eq 'final') {
  $installer = Join-Path $sourceRoot "release/Morpheus-$version-win-x64.exe"
  $signatures += Read-Signature 'installer' $installer
  # The pinned 7-Zip inspector exposes the embedded app payload directly. Inspect
  # only these two exact entries without running the installer or application.
  $inspection = Join-Path $env:RUNNER_TEMP ('morpheus-signature-inspection-' + [guid]::NewGuid().ToString('N'))
  $null = New-Item -ItemType Directory -Path $inspection
  $sevenZip = (& node -e "require('app-builder-lib/out/toolsets/7zip').getPath7za().then(p=>process.stdout.write(p)).catch(()=>{console.error('Pinned archive inspector unavailable.');process.exit(1)})").Trim()
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $sevenZip -PathType Leaf)) { throw 'Pinned archive inspector unavailable.' }
  $extraction = (& $sevenZip x '-t7z' $installer 'Morpheus.exe' 'resources/app.asar' "-o$inspection" '-y' 2>&1 | Out-String)
  $extractionExit = $LASTEXITCODE
  if ($extractionExit -notin @(0,1) -or $extraction -notmatch 'Everything is Ok' -or
    ($extractionExit -eq 1 -and $extraction -notmatch 'There are data after the end of archive')) {
    throw 'Final installer selected-payload extraction failed.'
  }
  $signatures += Read-Signature 'embedded-app' (Join-Path $inspection 'Morpheus.exe')
  $embeddedApplicationArchive = (Get-FileHash -LiteralPath (Join-Path $inspection 'resources/app.asar') -Algorithm SHA256).Hash.ToLowerInvariant()
  # UninstallerReader handles the builder's intermediate executable, not a final
  # signed installer. Its signature requires real disposable installed-VM proof.
  # No producer is configured yet: this missing evidence intentionally blocks
  # stable signing until real publisher assets and signed installation qualify.
  $installedEvidencePath = Join-Path $sourceRoot 'release/installed-uninstaller-signature.json'
  if (-not (Test-Path -LiteralPath $installedEvidencePath -PathType Leaf)) {
    throw 'Signed installed-VM uninstaller evidence is not configured; public release remains blocked.'
  }
  $installedUninstallerEvidence = Get-Content -LiteralPath $installedEvidencePath -Raw | ConvertFrom-Json -AsHashtable
  $signatures += $installedUninstallerEvidence.signature
  # Keep inspection files in disposable runner temp for failed-gate diagnostics.
}
$report = @{
  source=$source; version=$version; trackedClean=($changes.Count -eq 0)
  applicationArchiveSha256=$applicationArchive; embeddedApplicationArchiveSha256=$embeddedApplicationArchive
  installedUninstallerEvidence=$installedUninstallerEvidence
  signatures=$signatures; result='unverified'; errors=@()
}
$temporary = Join-Path $env:RUNNER_TEMP ('morpheus-signatures-' + [guid]::NewGuid().ToString('N') + '.json')
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $temporary -Encoding utf8NoBOM
$arguments = @($policy, "--report=$temporary", "--source=$ExpectedSource", "--version=$version", "--stage=$Stage")
if ($Stage -eq 'final') { $arguments += '--payload=release/payload-signing-verification.json' }
& node @arguments
if ($LASTEXITCODE -ne 0) { throw 'Public signing verification failed; no release artifact is approved.' }
$destination = if ($Stage -eq 'payload') { 'release/payload-signing-verification.json' } else { 'release/public-signing-verification.json' }
$report.result = 'passed'
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $destination -Encoding utf8NoBOM
