import { spawn } from 'node:child_process';
import { win32 } from 'node:path';
import { MORPHEUS_AMBIENT_WAKE_PHRASE_PATTERN } from '@shared/morpheus/voice-types';
import { MORPHEUS_WAKE_FRAME_BYTES } from '@shared/morpheus/wake-audio-types';

// Fixed, application-owned host bridge. User text is JSON on stdin, never code,
// arguments or a command template. No filesystem writes or network requests.
export const WINDOWS_WAKE_BRIDGE = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
try {
  Add-Type -AssemblyName System.Speech
  $config = [Console]::ReadLine() | ConvertFrom-Json
  Add-Type -ReferencedAssemblies ([System.Speech.Recognition.SpeechRecognitionEngine].Assembly.Location) -TypeDefinition @'
using System;
using System.IO;
using System.Globalization;
using System.Speech.Recognition;
using System.Threading;
// System.Speech uses file-style reads. Live input must block for a complete
// requested read, and expose an endless length rather than a pipe's unsupported
// Length/Seek. EOF is real termination, never synthetic silence.
public sealed class MorpheusWakeInput : Stream {
  private readonly Stream input = Console.OpenStandardInput();
  private long position;
  public override bool CanRead { get { return true; } }
  public override bool CanSeek { get { return false; } }
  public override bool CanWrite { get { return false; } }
  public override long Length { get { return -1; } }
  public override long Position { get { return Interlocked.Read(ref position); } set { throw new NotSupportedException(); } }
  public override int Read(byte[] buffer, int offset, int count) {
    int received = 0;
    while (received < count) {
      int next = input.Read(buffer, offset + received, count - received);
      if (next == 0) break;
      received += next;
    }
    Interlocked.Add(ref position, received);
    return received;
  }
  public override long Seek(long offset, SeekOrigin origin) { return Position; }
  public override void Flush() { }
  public override void SetLength(long value) { throw new NotSupportedException(); }
  public override void Write(byte[] buffer, int offset, int count) { throw new NotSupportedException(); }
}
// A single asynchronous recognition session preserves input-stream time after
// silence. Repeated Recognize(initialSilenceTimeout) calls report ranges from
// later operations while Main still owns the original monotonic PCM stream.
// The compiled event handler needs no PowerShell callback runspace.
public sealed class MorpheusWakeOutput {
  private readonly string phrase;
  private MorpheusWakeOutput(string value) { phrase = value; }
  public static void Attach(SpeechRecognitionEngine engine, string phrase) {
    var output = new MorpheusWakeOutput(phrase);
    engine.SpeechRecognized += output.OnRecognized;
    engine.RecognizeCompleted += output.OnCompleted;
  }
  private void OnRecognized(object sender, SpeechRecognizedEventArgs args) {
    var result = args.Result;
    if (result == null || result.Audio == null || String.IsNullOrEmpty(result.Text) || result.Confidence < 0.82) return;
    var text = result.Text;
    var prefix = phrase;
    if (text.StartsWith("hey " + prefix, StringComparison.OrdinalIgnoreCase)) prefix = "hey " + prefix;
    if (!text.Equals(prefix, StringComparison.OrdinalIgnoreCase)
      && !text.StartsWith(prefix + " ", StringComparison.OrdinalIgnoreCase)) return;
    // Native words only address the assistant. Included/selected recognition
    // still receives the original scoped PCM and remains the command source.
    long start = (long)Math.Round(result.Audio.AudioPosition.TotalSeconds * 16000);
    long count = (long)Math.Round(result.Audio.Duration.TotalSeconds * 16000);
    Console.WriteLine("audio-wake:{\"startSample\":" + start.ToString(CultureInfo.InvariantCulture)
      + ",\"sampleCount\":" + count.ToString(CultureInfo.InvariantCulture) + "}");
  }
  private void OnCompleted(object sender, RecognizeCompletedEventArgs args) {
    // Main must revoke capture when recognition ends unexpectedly. Its stopped
    // controller already ignores this line during an intentional cancellation.
    Console.WriteLine("unavailable");
  }
}
'@
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
    $inputAudio = [MorpheusWakeInput]::new()
    $format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(16000,
      [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
      [System.Speech.AudioFormat.AudioChannel]::Mono)
    $engine.SetInputToAudioStream($inputAudio, $format)
    [MorpheusWakeOutput]::Attach($engine, [string]$config.phrase)
    [Console]::WriteLine('ready')
    $engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
    while (Get-Process -Id $config.parentPid -ErrorAction SilentlyContinue) {
      Start-Sleep -Milliseconds 200
    }
  } finally { try { $engine.RecognizeAsyncCancel() } catch {}; $engine.Dispose() }
} catch { [Console]::WriteLine('unavailable'); exit 1 }
`;

export type LocalWakeController = { ready: Promise<void>; pushAudio(pcm: Buffer): Promise<void>; stop(): void };
export type LocalWakeAudioRange = { startSample: number; sampleCount: number };
export function startWindowsWake(options: {
  phrase: string;
  onWake(command?: string, audioRange?: LocalWakeAudioRange): void;
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
  let streamTimeout: ReturnType<typeof setTimeout> | undefined;
  let accept!: () => void;
  let reject!: (error: Error) => void;
  const readiness = new Promise<void>((resolve, fail) => { accept = resolve; reject = fail; });
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timeout);
    clearTimeout(streamTimeout);
    child.stdin.destroy();
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
      if (line === 'ready' && !ready) {
        ready = true; clearTimeout(timeout); accept();
        streamTimeout = setTimeout(failed, 3_000);
      }
      else if (line.startsWith('audio-wake:') && ready) {
        try {
          const range = JSON.parse(line.slice(11)) as LocalWakeAudioRange;
          if (!range || Object.keys(range).length !== 2 || !Number.isSafeInteger(range.startSample) || range.startSample < 0
            || !Number.isSafeInteger(range.sampleCount) || range.sampleCount <= 0 || range.sampleCount > 320_000) { failed(); return; }
          options.onWake(undefined, range);
        } catch { failed(); return; }
      }
      else { failed(); return; }
    }
  });
  // Keep stdin open: after this fixed JSON configuration it carries only raw
  // PCM from the already acquired selected Chromium microphone.
  child.stdin.write(JSON.stringify({ phrase: options.phrase, parentPid: process.pid }) + '\n');
  return {
    ready: readiness,
    stop,
    async pushAudio(pcm) {
      if (stopped || !ready) throw new Error('Local wake input is not ready.');
      if (pcm.length !== MORPHEUS_WAKE_FRAME_BYTES || child.stdin.writableLength > MORPHEUS_WAKE_FRAME_BYTES * 2) {
        failed();
        throw new Error('Local wake audio stalled. Restart companion voice.');
      }
      clearTimeout(streamTimeout);
      streamTimeout = setTimeout(failed, 3_000);
      await new Promise<void>((resolve, reject) => {
        child.stdin.write(pcm, (error) => { if (error) { failed(); reject(error); } else resolve(); });
      });
      if (stopped) throw new Error('Local wake input stopped.');
    },
  };
}
