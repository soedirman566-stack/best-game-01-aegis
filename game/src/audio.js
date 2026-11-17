// WebAudio synth effects: every sound is an oscillator or a burst of filtered noise, shaped by an
// envelope. No audio files, nothing to load. The context is created lazily and resumed on the first
// user gesture, as browsers require; every call is a no-op until then and safe in headless runs.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.2;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function tone(freq, dur, gain, type = 'square', slideTo = 0) {
    if (muted || !ensure()) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur);
  }

  function noise(dur, freq, gain) {
    if (muted || !ensure()) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start();
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    get muted() {
      return muted;
    },
    shot(kind) {
      if (kind === 'pulse') tone(880, 0.06, 0.1, 'square', 320);
      else if (kind === 'frost') tone(1320, 0.09, 0.08, 'sine', 1900);
      else if (kind === 'rail') { tone(160, 0.22, 0.22, 'sawtooth', 40); noise(0.16, 900, 0.14); }
      else if (kind === 'tesla') { noise(0.1, 3200, 0.12); tone(1900, 0.07, 0.05, 'sawtooth', 700); }
    },
    hit() { tone(2400, 0.03, 0.04, 'square'); },
    kill() { noise(0.14, 700, 0.14); tone(300, 0.12, 0.1, 'triangle', 70); },
    leak() { tone(196, 0.3, 0.22, 'sawtooth', 98); },
    place() { tone(520, 0.07, 0.14, 'triangle'); setTimeout(() => tone(780, 0.08, 0.12, 'triangle'), 60); },
    coin() { tone(1180, 0.05, 0.06, 'square'); },
    upgrade() { tone(660, 0.07, 0.12, 'triangle'); setTimeout(() => tone(990, 0.1, 0.12, 'triangle'), 70); },
    sell() { tone(840, 0.06, 0.1, 'triangle', 420); },
    denied() { tone(140, 0.12, 0.14, 'square'); },
    waveStart() { tone(392, 0.12, 0.16, 'square'); setTimeout(() => tone(587, 0.16, 0.16, 'square'), 110); },
    boss() { tone(82, 0.7, 0.26, 'sawtooth', 55); noise(0.5, 300, 0.1); },
    victory() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.22, 0.16, 'triangle'), i * 130)); },
    defeat() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.26, 0.16, 'triangle'), i * 150)); },
  };
}
