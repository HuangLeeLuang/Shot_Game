(function () {
  "use strict";

  class SoundEngine {
    constructor(getSettings) {
      this.getSettings = getSettings;
      this.ctx = null;
      this.music = null;
      this.musicGain = null;
    }

    ensure() {
      if (!this.ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return null;
        this.ctx = new AudioContext();
      }
      if (this.ctx.state === "suspended") {
        this.ctx.resume();
      }
      return this.ctx;
    }

    volume(kind) {
      const settings = this.getSettings();
      const master = Number(settings.masterVolume ?? 0.75);
      const local = kind === "music" ? Number(settings.musicVolume ?? 0.35) : Number(settings.sfxVolume ?? 0.8);
      return Math.max(0, Math.min(1, master * local));
    }

    beep(type) {
      const ctx = this.ensure();
      if (!ctx) return;

      const now = ctx.currentTime;
      const out = ctx.createGain();
      out.gain.value = 0.0001;
      out.connect(ctx.destination);

      const vol = this.volume("sfx");
      let oscType = "square";
      let freq = 220;
      let duration = 0.08;
      let peak = 0.18 * vol;

      if (type === "pistol") {
        freq = 190;
        duration = 0.075;
        peak = 0.22 * vol;
      } else if (type === "rifle") {
        freq = 140;
        duration = 0.065;
        peak = 0.2 * vol;
      } else if (type === "sniper") {
        freq = 95;
        duration = 0.14;
        peak = 0.28 * vol;
      } else if (type === "hit") {
        freq = 560;
        duration = 0.07;
        peak = 0.11 * vol;
        oscType = "triangle";
      } else if (type === "weak") {
        freq = 840;
        duration = 0.1;
        peak = 0.14 * vol;
        oscType = "triangle";
      } else if (type === "reload") {
        freq = 260;
        duration = 0.14;
        peak = 0.08 * vol;
        oscType = "sawtooth";
      } else if (type === "empty") {
        freq = 880;
        duration = 0.035;
        peak = 0.05 * vol;
      } else if (type === "ui") {
        freq = 420;
        duration = 0.05;
        peak = 0.06 * vol;
        oscType = "triangle";
      } else if (type === "fail") {
        freq = 110;
        duration = 0.3;
        peak = 0.11 * vol;
        oscType = "sawtooth";
      } else if (type === "clear") {
        freq = 620;
        duration = 0.18;
        peak = 0.12 * vol;
        oscType = "triangle";
      }

      const osc = ctx.createOscillator();
      osc.type = oscType;
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 0.58), now + duration);
      out.gain.setValueAtTime(0.0001, now);
      out.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), now + 0.006);
      out.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(out);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    }

    startMusic() {
      const ctx = this.ensure();
      if (!ctx || this.music) return;
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = this.volume("music") * 0.12;
      this.musicGain.connect(ctx.destination);

      const low = ctx.createOscillator();
      const pulse = ctx.createOscillator();
      low.type = "sine";
      pulse.type = "triangle";
      low.frequency.value = 55;
      pulse.frequency.value = 82;
      low.connect(this.musicGain);
      pulse.connect(this.musicGain);
      low.start();
      pulse.start();
      this.music = [low, pulse];
    }

    stopMusic() {
      if (!this.music) return;
      this.music.forEach((osc) => {
        try {
          osc.stop();
        } catch (error) {
          // Oscillator may already be stopped.
        }
      });
      this.music = null;
      this.musicGain = null;
    }

    updateMusicVolume() {
      if (this.musicGain) {
        this.musicGain.gain.value = this.volume("music") * 0.12;
      }
    }
  }

  window.SoundEngine = SoundEngine;
})();
