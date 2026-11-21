// WebAudio procedural sound synthesizer for engines, sirens, and effects
export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    muted: false,
    engineOsc1: null,
    engineOsc2: null,
    engineFilter: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    sirenOn: false,
    sirenTime: 0,

    ensure() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        return;
      }
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        this.ctx = new AudioCtx();
        this.master = this.ctx.createGain();
        this.master.gain.setValueAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime);
        this.master.connect(this.ctx.destination);

        // Engine synth
        this.engineOsc1 = this.ctx.createOscillator();
        this.engineOsc1.type = 'sawtooth';
        this.engineOsc1.frequency.setValueAtTime(60, this.ctx.currentTime);

        this.engineOsc2 = this.ctx.createOscillator();
        this.engineOsc2.type = 'sawtooth';
        this.engineOsc2.frequency.setValueAtTime(63, this.ctx.currentTime);

        this.engineFilter = this.ctx.createBiquadFilter();
        this.engineFilter.type = 'lowpass';
        this.engineFilter.frequency.setValueAtTime(300, this.ctx.currentTime);

        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.setValueAtTime(0, this.ctx.currentTime);

        this.engineOsc1.connect(this.engineFilter);
        this.engineOsc2.connect(this.engineFilter);
        this.engineFilter.connect(this.engineGain);
        this.engineGain.connect(this.master);

        this.engineOsc1.start();
        this.engineOsc2.start();

        // Siren synth
        this.sirenOsc = this.ctx.createOscillator();
        this.sirenOsc.type = 'triangle';
        this.sirenOsc.frequency.setValueAtTime(660, this.ctx.currentTime);

        this.sirenGain = this.ctx.createGain();
        this.sirenGain.gain.setValueAtTime(0, this.ctx.currentTime);

        this.sirenOsc.connect(this.sirenGain);
        this.sirenGain.connect(this.master);
        this.sirenOsc.start();

      } catch (e) {
        this.ctx = null;
      }
    },

    setEngine(speed01, driving) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      if (driving && speed01 >= 0) {
        const f1 = 50 + speed01 * 180;
        const f2 = f1 * 1.05;
        this.engineOsc1.frequency.setTargetAtTime(f1, t, 0.05);
        this.engineOsc2.frequency.setTargetAtTime(f2, t, 0.05);
        this.engineFilter.frequency.setTargetAtTime(200 + speed01 * 600, t, 0.05);
        this.engineGain.gain.setTargetAtTime(0.2 + speed01 * 0.25, t, 0.05);
      } else {
        this.engineGain.gain.setTargetAtTime(0, t, 0.1);
      }
    },

    setSiren(on) {
      if (!this.ctx) return;
      this.sirenOn = on;
      const t = this.ctx.currentTime;
      if (on) {
        this.sirenGain.gain.setTargetAtTime(0.25, t, 0.1);
      } else {
        this.sirenGain.gain.setTargetAtTime(0, t, 0.1);
      }
    },

    update(dt) {
      if (!this.ctx || !this.sirenOn) return;
      this.sirenTime += dt;
      // Wail between 660 and 920 Hz every 1.2 seconds
      const cycle = (this.sirenTime % 1.2) / 1.2;
      const freq = 660 + Math.sin(cycle * Math.PI * 2) * 130 + 130;
      this.sirenOsc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    },

    playTone(freqs, type, duration, gainVal = 0.2) {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type || 'sine';
      osc.connect(gain);
      gain.connect(this.master);

      freqs.forEach((f, i) => {
        const t = now + i * (duration / freqs.length);
        osc.frequency.setValueAtTime(f, t);
      });

      gain.gain.setValueAtTime(gainVal, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.start(now);
      osc.stop(now + duration);
    },

    pickup() {
      this.playTone([440, 554, 659, 880], 'sine', 0.3, 0.25);
    },

    mission() {
      this.playTone([523, 659, 784, 1046], 'triangle', 0.4, 0.3);
    },

    fail() {
      this.playTone([440, 370, 311, 220], 'sawtooth', 0.5, 0.3);
    },

    punch() {
      if (!this.ctx) return;
      // Filtered noise / low thud
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.15);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + 0.15);
    },

    crash() {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      // Noise burst for crash
      const bufferSize = this.ctx.sampleRate * 0.3;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(400, now);
      filter.frequency.linearRampToValueAtTime(80, now + 0.3);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);

      noise.start(now);
    },

    click() {
      this.playTone([800], 'square', 0.05, 0.1);
    },

    toggleMute() {
      this.muted = !this.muted;
      if (this.master && this.ctx) {
        this.master.gain.setValueAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime);
      }
      return this.muted;
    }
  };

  return audio;
}
