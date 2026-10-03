// boatSound.js - small, quiet procedural boat sound (no audio files needed)
// Usage:
//   import { boatSound } from "./boatSound";
//   boatSound.enable();            // call from a click/keypress (browsers block audio until a user gesture)
//   boatSound.setSpeed(speedKn);   // call every frame or whenever the speed changes
//   boatSound.disable();           // mute (for your AUDIO OFF button)

const MAX_VOLUME = 0.06;   // keep this low: 0.03 = very quiet, 0.1 = noticeable
const MAX_SPEED_KN = 20;   // speed at which the sound is at its loudest

class BoatSound {
  constructor() { this.ctx = null; this.on = false; }

  _init() {
    if (this.ctx) return;
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());

    // master volume
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // engine: two detuned low oscillators through a low-pass filter
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = "lowpass";
    this.engineFilter.frequency.value = 220;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.5;
    this.osc1 = ctx.createOscillator();
    this.osc2 = ctx.createOscillator();
    this.osc1.type = "sawtooth";
    this.osc2.type = "triangle";
    this.osc1.frequency.value = 42;
    this.osc2.frequency.value = 43.5;
    this.osc1.connect(this.engineFilter);
    this.osc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.master);

    // water: looping brown noise through a low-pass filter
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
    this.noise = ctx.createBufferSource();
    this.noise.buffer = buf;
    this.noise.loop = true;
    this.waterFilter = ctx.createBiquadFilter();
    this.waterFilter.type = "lowpass";
    this.waterFilter.frequency.value = 500;
    this.waterGain = ctx.createGain();
    this.waterGain.gain.value = 0.2;
    this.noise.connect(this.waterFilter).connect(this.waterGain).connect(this.master);

    this.osc1.start(); this.osc2.start(); this.noise.start();
  }

  enable() {
    this._init();
    if (this.ctx.state === "suspended") this.ctx.resume();
    this.on = true;
    this.master.gain.setTargetAtTime(MAX_VOLUME * 0.35, this.ctx.currentTime, 0.3); // idle level
  }

  disable() {
    if (!this.ctx) return;
    this.on = false;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
  }

  // speed in knots (use Math.abs if you can reverse)
  setSpeed(kn) {
    if (!this.ctx || !this.on) return;
    const t = Math.min(1, Math.abs(kn) / MAX_SPEED_KN);
    const now = this.ctx.currentTime;
    this.osc1.frequency.setTargetAtTime(42 + t * 38, now, 0.25);
    this.osc2.frequency.setTargetAtTime(43.5 + t * 38, now, 0.25);
    this.engineFilter.frequency.setTargetAtTime(220 + t * 260, now, 0.25);
    this.waterGain.gain.setTargetAtTime(0.2 + t * 0.6, now, 0.25);
    this.waterFilter.frequency.setTargetAtTime(500 + t * 900, now, 0.25);
    this.master.gain.setTargetAtTime(MAX_VOLUME * (0.35 + 0.65 * t), now, 0.25);
  }
}

export const boatSound = new BoatSound();
