/** Only named Spotify playback and default-output volume; no global media keys,
 * microphone access, song metadata, arbitrary session id or script injection. */
export const WINDOWS_MEDIA_HELPER = String.raw`
$ErrorActionPreference = 'Stop'
$failureCode = 'unavailable'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class DeviceEnumerator {}
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IDevices {
  [PreserveSig] int EnumAudioEndpoints(int flow, int state, out IntPtr devices);
  [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IDevice device);
}
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IDevice {
  [PreserveSig] int Activate(ref Guid id, int context, IntPtr parameters, [MarshalAs(UnmanagedType.IUnknown)] out object instance);
  [PreserveSig] int OpenPropertyStore(int access, out IntPtr properties);
  [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
}
[ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IVolume {
  [PreserveSig] int RegisterControlChangeNotify(IntPtr value);
  [PreserveSig] int UnregisterControlChangeNotify(IntPtr value);
  [PreserveSig] int GetChannelCount(out uint value);
  [PreserveSig] int SetMasterVolumeLevel(float value, ref Guid context);
  [PreserveSig] int SetMasterVolumeLevelScalar(float value, ref Guid context);
  [PreserveSig] int GetMasterVolumeLevel(out float value);
  [PreserveSig] int GetMasterVolumeLevelScalar(out float value);
}
public static class MorpheusAudio {
  [DllImport("user32.dll")] static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern bool GetUserObjectInformation(IntPtr obj, int index, StringBuilder text, int length, out int needed);
  [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desktop);
  public static bool Available() {
    var desktop=OpenInputDesktop(0,false,1); if (desktop==IntPtr.Zero) return false;
    try { int needed; var name=new StringBuilder(256); return GetUserObjectInformation(desktop,2,name,512,out needed) && name.ToString()=="Default"; }
    finally { CloseDesktop(desktop); }
  }
  public class State { public string deviceId; public int level; }
  public static State Volume(bool write, string expectedId, int level) {
    if (!Available()) throw new Exception("unavailable");
    var devices=(IDevices)new DeviceEnumerator(); IDevice device=null; object volumeObject=null;
    try {
      Marshal.ThrowExceptionForHR(devices.GetDefaultAudioEndpoint(0,1,out device));
      string id; Marshal.ThrowExceptionForHR(device.GetId(out id));
      var volumeId=new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
      Marshal.ThrowExceptionForHR(device.Activate(ref volumeId,23,IntPtr.Zero,out volumeObject));
      var volume=(IVolume)volumeObject;
      if (write) {
        if (id!=expectedId || level<0 || level>100) throw new Exception("changed");
        var context=Guid.Empty; Marshal.ThrowExceptionForHR(volume.SetMasterVolumeLevelScalar(level/100f,ref context));
      }
      float observed; Marshal.ThrowExceptionForHR(volume.GetMasterVolumeLevelScalar(out observed));
      return new State { deviceId=id, level=(int)Math.Round(observed*100) };
    } finally { if(volumeObject!=null) Marshal.ReleaseComObject(volumeObject); if(device!=null) Marshal.ReleaseComObject(device); Marshal.ReleaseComObject(devices); }
  }
}
'@
  $inputJson = [Console]::In.ReadLine()
  if (!$inputJson -or $inputJson.Length -gt 8192) { throw 'invalid' }
  $data = $inputJson | ConvertFrom-Json
  if (@('inspect','execute') -notcontains $data.command -or ![MorpheusAudio]::Available()) { throw 'unavailable' }
  if ($data.target -eq 'system-volume') {
    if ($data.command -eq 'inspect') { $state = [MorpheusAudio]::Volume($false, $null, -1) }
    else {
      if ($data.level -isnot [int] -or $data.level -lt 0 -or $data.level -gt 100 -or !$data.deviceId) { throw 'invalid' }
      $state = [MorpheusAudio]::Volume($true, [string]$data.deviceId, [int]$data.level)
    }
    @{ ok=$true; deviceId=$state.deviceId; level=$state.level } | ConvertTo-Json -Compress
  } elseif ($data.target -eq 'spotify') {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
    $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation' + [char]96 + '1' } | Select-Object -First 1
    function AwaitOperation($operation, $type) {
      $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation))
      if (!$task.Wait(2500)) { throw 'timeout' }
      return $task.Result
    }
    $manager = AwaitOperation ($managerType::RequestAsync()) $managerType
    $knownIds = @('Spotify.exe','Spotify','SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify')
    $sessions = @($manager.GetSessions() | Where-Object { $knownIds -ccontains $_.SourceAppUserModelId })
    if ($sessions.Count -ne 1) { $failureCode = if ($sessions.Count -eq 0) { 'no-session' } else { 'ambiguous-session' }; throw 'unavailable' }
    $session = $sessions[0]
    $sourceId = [string]$session.SourceAppUserModelId
    $before = $session.GetPlaybackInfo()
    if ($data.command -eq 'execute') {
      if ($sourceId -cne $data.sourceId -or @('play','pause') -notcontains $data.operation) { throw 'changed' }
      $wanted = if ($data.operation -eq 'play') { 'Playing' } else { 'Paused' }
      if ([string]$before.PlaybackStatus -ne $wanted) {
        if ($data.operation -eq 'play') {
          if (!$before.Controls.IsPlayEnabled) { throw 'unsupported' }
          $accepted = AwaitOperation ($session.TryPlayAsync()) ([bool])
        } else {
          if (!$before.Controls.IsPauseEnabled) { throw 'unsupported' }
          $accepted = AwaitOperation ($session.TryPauseAsync()) ([bool])
        }
        if (!$accepted) { throw 'unsupported' }
      }
      for ($index=0; $index -lt 20; $index++) {
        if ([string]$session.GetPlaybackInfo().PlaybackStatus -eq $wanted) { break }
        Start-Sleep -Milliseconds 50
      }
    }
    @{ ok=$true; sourceId=$sourceId; state=[string]$session.GetPlaybackInfo().PlaybackStatus } | ConvertTo-Json -Compress
  } else { throw 'invalid' }
} catch { @{ ok=$false; code=$failureCode } | ConvertTo-Json -Compress }
`;
