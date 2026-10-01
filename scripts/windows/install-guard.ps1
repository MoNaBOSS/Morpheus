param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Check', 'Prepare', 'Restore')][string]$Action,
  [Parameter(Mandatory = $true)][string]$InstallDir,
  [string]$BackupDir
)

# -File arguments, never string-built -Command. No process termination or deletion.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-SafeInstallPath([string]$Value) {
  if ($Value -notmatch '^[a-zA-Z]:[\\/]' -or $Value.IndexOfAny([char[]]'*?') -ge 0) {
    throw 'Choose an absolute local installation folder.'
  }
  $target = [IO.Path]::GetFullPath($Value).TrimEnd('\', '/')
  if ($target.Length -le 3) { throw 'A drive root cannot be an installation folder.' }
  $protected = @([Environment]::GetFolderPath('UserProfile'), [Environment]::GetFolderPath('Desktop'),
    [Environment]::GetFolderPath('MyDocuments'), [Environment]::GetFolderPath('LocalApplicationData'),
    [Environment]::GetFolderPath('ApplicationData'), [Environment]::GetFolderPath('CommonApplicationData'),
    [Environment]::GetFolderPath('ProgramFiles'), [Environment]::GetFolderPath('ProgramFilesX86'),
    [Environment]::GetFolderPath('Windows'), [Environment]::GetFolderPath('System'))
  foreach ($folder in $protected) {
    if ($folder -and $target.Equals($folder.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)) {
      throw 'Choose a dedicated Morpheus folder, not a shared system or personal folder.'
    }
  }
  $cursor = $target
  while ($cursor -and $cursor.Length -gt 3) {
    if (Test-Path -LiteralPath $cursor) {
      $item = Get-Item -LiteralPath $cursor -Force
      if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'Installation folders must be real directories, not links or redirected folders.'
      }
    }
    $cursor = [IO.Path]::GetDirectoryName($cursor)
  }
  return $target
}

function Assert-Product([string]$Target) {
  if (-not (Test-Path -LiteralPath (Join-Path $Target 'Morpheus.exe') -PathType Leaf) -or
      -not (Test-Path -LiteralPath (Join-Path $Target 'resources\app.asar') -PathType Leaf)) {
    throw 'The nonempty destination is not a recognized Morpheus installation. No files were changed.'
  }
  if (Test-Path -LiteralPath (Join-Path $Target '.git')) { throw 'A source checkout cannot be replaced by an installer.' }
}

function Assert-Closed([string]$Target) {
  $prefix = $Target + '\'
  $running = @(Get-CimInstance -ClassName Win32_Process -ErrorAction Stop | Where-Object {
    $_.ExecutablePath -and $_.ExecutablePath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)
  })
  if ($running.Count -gt 0) { throw 'Close Morpheus and its tasks in the selected installation, then retry. No processes were stopped.' }
}

try {
  $target = Get-SafeInstallPath $InstallDir
  Assert-Closed $target
  if ($Action -eq 'Check') { exit 0 }
  $backup = Get-SafeInstallPath $BackupDir
  if ($backup -notmatch ('^' + [regex]::Escape($target) + '\._rollback_[0-9]+$')) {
    throw 'Invalid installation backup target.'
  }
  if ($Action -eq 'Prepare') {
    if (Test-Path -LiteralPath $backup) { throw 'Backup already exists; it must not be overwritten.' }
    if (Test-Path -LiteralPath $target) {
      $items = @(Get-ChildItem -LiteralPath $target -Force)
      if ($items.Count -gt 0) {
        Assert-Product $target
        Move-Item -LiteralPath $target -Destination $backup -ErrorAction Stop
      }
    }
    exit 0
  }
  Assert-Product $backup
  Assert-Closed $backup
  if (Test-Path -LiteralPath $target) {
    # Keep partial extraction too, rather than deleting it recursively.
    $failed = Get-SafeInstallPath ($target + '._failed_' + [Guid]::NewGuid().ToString('N'))
    if (Test-Path -LiteralPath $failed) { throw 'Recovery destination already exists.' }
    Move-Item -LiteralPath $target -Destination $failed -ErrorAction Stop
  }
  Move-Item -LiteralPath $backup -Destination $target -ErrorAction Stop
  exit 0
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 2
}
