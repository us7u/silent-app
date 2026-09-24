// Procedural WebAudio sound effects — no assets required.
export class Sfx {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private staticGain!: GainNode;
  private droneGain!: GainNode;
  private droneFilter!: BiquadFilterNode;
  private last: Record<string, number> = {};

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC: typeof AudioContext | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.6;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;

    // Radio static
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400;
    bp.Q.value = 0.5;
    this.staticGain = ctx.createGain();
    this.staticGain.gain.value = 0;
    src.connect(bp).connect(this.staticGain).connect(this.master);
    src.start();

    // Ambient drone
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 170;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.0;
    this.droneFilter.connect(this.droneGain).connect(this.master);
    const freqs: [number, OscillatorType][] = [
      [55, 'sawtooth'],
      [55.35, 'sawtooth'],
      [82.4, 'sine'],
      [41.2, 'triangle'],
    ];
    for (const [f, type] of freqs) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.connect(this.droneFilter);
      o.start();
    }
    this.droneGain.gain.setTargetAtTime(0.06, ctx.currentTime, 1.5);
  }

  suspend() {
    this.ctx?.suspend();
  }
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  private ok(key: string, gap: number) {
    if (!this.ctx) return false;
    const now = performance.now();
    if ((this.last[key] ?? 0) + gap > now) return false;
    this.last[key] = now;
    return true;
  }

  private noiseSrc() {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    return s;
  }

  private gainEnv(t: number, peak: number, attack: number, decay: number) {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(this.master);
    return g;
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, peak: number, delay = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = this.gainEnv(t, peak, 0.005, dur);
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(freq: number, endFreq: number, dur: number, peak: number, type: BiquadFilterType = 'lowpass', q = 1) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const s = this.noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    const g = this.gainEnv(t, peak, 0.004, dur);
    s.connect(f).connect(g);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }

  shoot() {
    if (!this.ok('shoot', 40)) return;
    this.burst(4000, 300, 0.18, 0.7);
    this.tone('sine', 160, 38, 0.14, 0.8);
    this.tone('square', 900, 200, 0.03, 0.08);
  }
  empty() {
    if (!this.ok('empty', 120)) return;
    this.tone('square', 1800, 1200, 0.02, 0.06);
  }
  swing() {
    if (!this.ok('swing', 60)) return;
    this.burst(400, 2200, 0.2, 0.35, 'bandpass', 2);
  }
  dodge() {
    if (!this.ok('dodge', 60)) return;
    this.burst(1200, 300, 0.2, 0.25, 'bandpass', 1.2);
  }
  hit() {
    if (!this.ok('hit', 35)) return;
    this.tone('square', 140, 50, 0.08, 0.18);
    this.burst(900, 200, 0.08, 0.3);
  }
  clang() {
    if (!this.ok('clang', 60)) return;
    this.tone('triangle', 1400, 1100, 0.25, 0.12);
    this.tone('square', 2300, 1900, 0.1, 0.05);
  }
  kill(big = false) {
    if (!this.ok('kill', 40)) return;
    this.tone('sawtooth', big ? 90 : 160, 30, big ? 0.6 : 0.25, 0.3);
    this.burst(600, 80, big ? 0.5 : 0.22, 0.5);
  }
  ric() {
    if (!this.ok('ric', 50)) return;
    this.tone('sine', 2600 + Math.random() * 800, 1800, 0.08, 0.05);
  }
  hurt() {
    if (!this.ok('hurt', 100)) return;
    this.tone('sawtooth', 220, 70, 0.3, 0.3);
    this.burst(1500, 100, 0.25, 0.4);
  }
  pickup() {
    if (!this.ok('pickup', 50)) return;
    this.tone('sine', 660, 660, 0.08, 0.15);
    this.tone('sine', 990, 990, 0.12, 0.15, 0.07);
  }
  fragment() {
    if (!this.ctx) return;
    const notes = [392, 466, 587, 784];
    notes.forEach((n, i) => this.tone('triangle', n, n, 0.6, 0.12, i * 0.09));
    this.tone('sine', 196, 196, 1.2, 0.1);
  }
  slam() {
    if (!this.ok('slam', 100)) return;
    this.tone('sine', 90, 25, 0.7, 0.9);
    this.burst(1200, 60, 0.6, 0.7);
    this.tone('triangle', 700, 500, 0.4, 0.08);
  }
  growl(deep = false) {
    if (!this.ok('growl', 400)) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const base = deep ? 45 : 75 + Math.random() * 30;
    o.frequency.setValueAtTime(base, t);
    o.frequency.linearRampToValueAtTime(base * 0.7, t + 0.7);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 13;
    const lg = ctx.createGain();
    lg.gain.value = base * 0.2;
    lfo.connect(lg).connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = deep ? 300 : 500;
    const g = this.gainEnv(t, deep ? 0.35 : 0.12, 0.1, 0.7);
    o.connect(f).connect(g);
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.9);
    lfo.stop(t + 0.9);
  }
  siren() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 1.2);
    g.gain.setValueAtTime(0.2, t + 5.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 8.5);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1500;
    f.connect(g).connect(this.master);
    for (const [type, mul] of [
      ['sawtooth', 1],
      ['sine', 1.008],
      ['square', 0.5],
    ] as [OscillatorType, number][]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(110 * mul, t);
      o.frequency.linearRampToValueAtTime(520 * mul, t + 3.2);
      o.frequency.setValueAtTime(520 * mul, t + 5.5);
      o.frequency.linearRampToValueAtTime(120 * mul, t + 8.5);
      const og = ctx.createGain();
      og.gain.value = type === 'square' ? 0.2 : 0.5;
      o.connect(og).connect(f);
      o.start(t);
      o.stop(t + 8.6);
    }
  }

  setStatic(level: number) {
    if (!this.ctx) return;
    const crackle = Math.random() < 0.15 ? 1.8 : 0.6 + Math.random() * 0.6;
    const v = level * level * 0.32 * crackle;
    this.staticGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
  }

  setOtherworld(o: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.droneGain.gain.setTargetAtTime(0.06 + o * 0.12, t, 0.3);
    this.droneFilter.frequency.setTargetAtTime(170 + o * 260, t, 0.3);
  }

  silence() {
    if (!this.ctx) return;
    this.staticGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  }
}
