/* Fixed application-owned processor: 16 kHz mono PCM16, 200 ms per frame. */
class MorpheusWakeAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frame = new Int16Array(3200);
    this.offset = 0;
    this.sum = 0;
    this.weight = 0;
    this.ratio = sampleRate / 16000;
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (const sample of input) {
      let remaining = 1;
      while (remaining > 0) {
        const consumed = Math.min(remaining, this.ratio - this.weight);
        this.sum += sample * consumed;
        this.weight += consumed;
        remaining -= consumed;
        if (this.weight >= this.ratio - 1e-8) {
          const value = Math.max(-1, Math.min(1, this.sum / this.weight));
          this.frame[this.offset++] = Math.round(value * (value < 0 ? 32768 : 32767));
          this.sum = 0;
          this.weight = 0;
          if (this.offset === this.frame.length) {
            this.port.postMessage(this.frame.buffer, [this.frame.buffer]);
            this.frame = new Int16Array(3200);
            this.offset = 0;
          }
        }
      }
    }
    return true;
  }
}
registerProcessor('morpheus-wake-audio', MorpheusWakeAudioProcessor);
