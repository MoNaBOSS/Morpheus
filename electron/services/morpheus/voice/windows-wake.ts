import { spawn } from 'node:child_process';
import { win32 } from 'node:path';
import { MORPHEUS_AMBIENT_WAKE_PHRASE_PATTERN } from '@shared/morpheus/voice-types';

// Fixed, application-owned host bridge. User text is JSON on stdin, never code,
// arguments or a command template. No filesystem writes or network requests.
export const WINDOWS_WAKE_BRIDGE = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
try {
  Add-Type -AssemblyName System.Speech
  $config = [Console]::ReadLine() | ConvertFrom-Json
  $info = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() |
    Where-Object { $_.Culture.TwoLetterISOLanguageName -eq 'en' } | Select-Object -First 1
  if (-not $info) { throw 'recognizer unavailable' }
  $engine = [System.Speech.Recognition.SpeechRecognitionEngine]::new($info)
  try {
    $choices = [System.Speech.Recognition.Choices]::new()
    $choices.Add([string]$config.phrase)
    $choices.Add('hey ' + [string]$config.phrase)
    $grammar = [System.Speech.Recognition.GrammarBuilder]::new($choices)
    $grammar.Culture = $info.Culture
    $engine.LoadGrammar([System.Speech.Recognition.Grammar]::new($grammar))
    $commandGrammar = [System.Speech.Recognition.GrammarBuilder]::new($choices)
    $commandGrammar.Culture = $info.Culture
    $commandGrammar.AppendDictation()
    $engine.LoadGrammar([System.Speech.Recognition.Grammar]::new($commandGrammar))
    $engine.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(200)
    $engine.EndSilenceTimeoutAmbiguous = [TimeSpan]::FromMilliseconds(300)
    $engine.BabbleTimeout = [TimeSpan]::FromSeconds(2)
    $engine.SetInputToDefaultAudioDevice()
    [Console]::WriteLine('ready')
    while (Get-Process -Id $config.parentPid -ErrorAction SilentlyContinue) {
      $result = $engine.Recognize([TimeSpan]::FromSeconds(1))
      if ($null -ne $result -and $result.Confidence -ge 0.82) {
        $text = [string]$result.Text
        $prefix = [string]$config.phrase
        if ($text.StartsWith('hey ' + $prefix, [StringComparison]::OrdinalIgnoreCase)) { $prefix = 'hey ' + $prefix }
        if ($text.Equals($prefix, [StringComparison]::OrdinalIgnoreCase)) { [Console]::WriteLine('wake') }
        elseif ($text.StartsWith($prefix + ' ', [StringComparison]::OrdinalIgnoreCase)) {
          $command = $text.Substring($prefix.Length).Trim()
          if ($command.Length -gt 0 -and $command.Length -le 2000) {
            [Console]::WriteLine('command:' + (ConvertTo-Json -InputObject $command -Compress))
          }
        }
      }
    }
  } finally { $engine.Dispose() }
} catch { [Console]::WriteLine('unavailable'); exit 1 }
`;

export type LocalWakeController = { ready: Promise<void>; stop(): void };
export function startWindowsWake(options: {
  phrase: string;
  onWake(command?: string): void;
  onError(): void;
}): LocalWakeController {
  if (process.platform !== 'win32') throw new Error('Local wake detection currently requires Windows.');
  if (!MORPHEUS_AMBIENT_WAKE_PHRASE_PATTERN.test(options.phrase)) throw new Error('Invalid wake phrase.');
  const executable = win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand',
    Buffer.from(WINDOWS_WAKE_BRIDGE, 'utf16le').toString('base64')], {
    shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stopped = false;
  let ready = false;
  let buffer = '';
  let accept!: () => void;
  let reject!: (error: Error) => void;
  const readiness = new Promise<void>((resolve, fail) => { accept = resolve; reject = fail; });
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timeout);
    child.kill();
    if (!ready) reject(new Error('Local wake detection stopped.'));
  };
  const failed = () => {
    if (stopped) return;
    const wasReady = ready;
    if (!ready) reject(new Error('Windows local wake is unavailable. Check the microphone and installed English speech recognition.'));
    stop();
    if (wasReady) options.onError();
  };
  const timeout = setTimeout(failed, 15_000);
  child.on('error', failed);
  child.on('exit', failed);
  child.stdin.on('error', failed);
  child.stderr.resume(); // Never propagate local audio device details into logs/UI.
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    if (stopped) return;
    buffer += chunk;
    if (buffer.length > 4096) { failed(); return; }
    let newline: number;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line === 'ready' && !ready) { ready = true; clearTimeout(timeout); accept(); }
      else if (line === 'wake' && ready) options.onWake();
      else if (line.startsWith('command:') && ready) {
        try {
          const command: unknown = JSON.parse(line.slice(8));
          if (typeof command !== 'string' || !command.trim() || command.length > 2000) { failed(); return; }
          options.onWake(command.trim());
        } catch { failed(); return; }
      }
      else { failed(); return; }
    }
  });
  child.stdin.end(JSON.stringify({ phrase: options.phrase, parentPid: process.pid }) + '\n');
  return { ready: readiness, stop };
}
