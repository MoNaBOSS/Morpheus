/** Fixed app-owned helper. JSON arrives on stdin, never interpolated into code. */
export const WINDOWS_WINDOW_HELPER = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
public static class MorpheusWindows {
  public delegate bool EnumProc(IntPtr window, IntPtr param);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr param);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr window, int operation);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern bool GetUserObjectInformation(IntPtr obj, int index, StringBuilder text, int length, out int needed);
  [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desktop);
  public class Window {
    public string handle; public int processId; public string started; public string path;
    public bool minimized; public bool foreground;
  }
  public static bool Available() {
    IntPtr desktop = OpenInputDesktop(0, false, 1);
    if (desktop == IntPtr.Zero) return false;
    try { int needed; var name = new StringBuilder(256); return GetUserObjectInformation(desktop, 2, name, 512, out needed) && name.ToString() == "Default"; }
    finally { CloseDesktop(desktop); }
  }
  public static Window Read(IntPtr window, string processName) {
    if (!IsWindowVisible(window)) return null;
    uint applicationProcessId;
    if (GetWindowThreadProcessId(window, out applicationProcessId) == 0) return null;
    try {
      using (var process = Process.GetProcessById((int)applicationProcessId)) {
        if (!String.Equals(process.ProcessName, processName, StringComparison.OrdinalIgnoreCase)) return null;
        return new Window { handle=window.ToInt64().ToString(), processId=process.Id,
          started=process.StartTime.ToUniversalTime().Ticks.ToString(), path=process.MainModule.FileName,
          minimized=IsIconic(window), foreground=GetForegroundWindow()==window };
      }
    } catch { return null; }
  }
  public static Window[] List(string processName) {
    var list = new List<Window>();
    EnumWindows((window, ignored) => { var item = Read(window, processName); if (item != null) list.Add(item); return list.Count < 17; }, IntPtr.Zero);
    return list.ToArray();
  }
}
'@
  $inputJson = [Console]::In.ReadLine()
  if (!$inputJson -or $inputJson.Length -gt 8192) { throw 'invalid' }
  $data = $inputJson | ConvertFrom-Json
  $apps = @{
    notepad = @('notepad','Microsoft.WindowsNotepad','Microsoft.WindowsNotepad_8wekyb3d8bbwe');
    calculator = @('CalculatorApp','Microsoft.WindowsCalculator','Microsoft.WindowsCalculator_8wekyb3d8bbwe');
    paint = @('mspaint','Microsoft.Paint','Microsoft.Paint_8wekyb3d8bbwe');
    spotify = @('Spotify','SpotifyAB.SpotifyMusic','SpotifyAB.SpotifyMusic_zpdnekdrzrea0')
  }
  if (!$apps.ContainsKey([string]$data.applicationKey) -or ![MorpheusWindows]::Available()) { throw 'unavailable' }
  $entry = $apps[[string]$data.applicationKey]
  if ($data.command -eq 'inspect') {
    $windows = @([MorpheusWindows]::List($entry[0]))
    # Classic Windows Calculator has a different process name.
    if ($data.applicationKey -eq 'calculator' -and $windows.Count -eq 0) { $windows = @([MorpheusWindows]::List('calc')) }
    $packageRoot = $null
    # Avoid an expensive Appx inventory on the common classic-app path.
    $packagePrefix = [IO.Path]::Combine($env:ProgramFiles, 'WindowsApps') + '\'
    if (@($windows | Where-Object { $_.path.StartsWith($packagePrefix, [StringComparison]::OrdinalIgnoreCase) }).Count -gt 0) {
      $package = @(Get-AppxPackage -Name $entry[1] -ErrorAction SilentlyContinue | Where-Object { $_.PackageFamilyName -eq $entry[2] })
      if ($package.Count -eq 1) { $packageRoot = [string]$package[0].InstallLocation }
    }
    @{ ok=$true; windows=$windows; packageRoot=$packageRoot; foreground=[MorpheusWindows]::GetForegroundWindow().ToInt64().ToString() } | ConvertTo-Json -Compress -Depth 6
  } elseif ($data.command -eq 'execute') {
    if (@('focus','minimize','restore') -notcontains $data.operation) { throw 'invalid' }
    $windowHandle = [IntPtr]::new([long]$data.window.handle)
    $current = [MorpheusWindows]::Read($windowHandle, $entry[0])
    if (!$current -and $data.applicationKey -eq 'calculator') { $current = [MorpheusWindows]::Read($windowHandle, 'calc') }
    if (!$current -or $current.processId -ne $data.window.processId -or $current.started -cne $data.window.started -or $current.path -ine $data.window.path) { throw 'changed' }
    if ([MorpheusWindows]::GetForegroundWindow().ToInt64().ToString() -cne $data.foreground) { throw 'focus-changed' }
    if ($data.operation -eq 'minimize') { [void][MorpheusWindows]::ShowWindowAsync($windowHandle, 6) }
    else {
      # SHOWNA restores without activation; explicit focus alone requests activation.
      [void][MorpheusWindows]::ShowWindowAsync($windowHandle, 4)
      if ($data.operation -eq 'focus') { [void][MorpheusWindows]::SetForegroundWindow($windowHandle) }
    }
    $observed = $false
    for ($index=0; $index -lt 20; $index++) {
      Start-Sleep -Milliseconds 50
      $current = [MorpheusWindows]::Read($windowHandle, $entry[0])
      if (!$current -and $data.applicationKey -eq 'calculator') { $current = [MorpheusWindows]::Read($windowHandle, 'calc') }
      if (!$current -or $current.processId -ne $data.window.processId -or $current.started -cne $data.window.started -or ![MorpheusWindows]::Available()) { throw 'changed' }
      $observed = ($data.operation -eq 'minimize' -and $current.minimized) -or ($data.operation -eq 'restore' -and !$current.minimized) -or ($data.operation -eq 'focus' -and $current.foreground -and !$current.minimized)
      if ($observed) { break }
    }
    @{ ok=$observed; code='not-observed'; window=$current } | ConvertTo-Json -Compress -Depth 6
  } else { throw 'invalid' }
} catch { @{ ok=$false; code='unavailable' } | ConvertTo-Json -Compress }
`;
