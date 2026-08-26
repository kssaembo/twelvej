type PremiumCue = "start" | "victory" | "promote";

const files: Record<PremiumCue, string> = {
  start: "/audio/sfx/game_start.wav",
  victory: "/audio/sfx/match_victory.wav",
  promote: "/audio/sfx/piece_promote.wav",
};

class AudioDirector {
  private context: AudioContext | null = null;
  private bgm: HTMLAudioElement | null = null;
  private resultBgm: HTMLAudioElement | null = null;
  private enabled = false;
  private volume = 0.16;
  private mode: "main" | "result" = "main";

  private notify() { if (typeof window !== "undefined") window.dispatchEvent(new Event("twelve-audio-change")); }

  constructor() {
    if (typeof window !== "undefined") {
      this.enabled = localStorage.getItem("twelve-sound") === "on";
      this.volume = Number(localStorage.getItem("twelve-volume") || 0.16);
    }
  }

  isEnabled() {
    return this.enabled;
  }

  getVolume() { return this.volume; }
  getMode() { return this.mode; }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    localStorage.setItem("twelve-volume", String(this.volume));
    if (this.bgm) this.bgm.volume = this.volume;
    if (this.resultBgm) this.resultBgm.volume = Math.min(0.32, this.volume + 0.08);
    this.notify();
  }

  async playResultBgm() {
    this.mode = "result";
    this.enabled = true;
    localStorage.setItem("twelve-sound", "on");
    this.bgm?.pause();
    this.resultBgm ??= Object.assign(new Audio("/audio/bgm/bgm_results.mp3"), { loop: true, volume: Math.min(0.32, this.volume + 0.08) });
    this.resultBgm.currentTime = 0;
    try { await this.resultBgm.play(); } catch { /* Autoplay may wait for a direct click. */ }
    this.notify();
  }

  stopResultBgm() { if (this.resultBgm) { this.resultBgm.pause(); this.resultBgm.currentTime = 0; } this.mode = "main"; this.notify(); }

  stopAll() {
    [this.bgm, this.resultBgm].forEach((track) => { if (track) { track.pause(); track.currentTime = 0; } });
    this.context?.suspend().catch(() => undefined);
  }

  pauseAll() { this.bgm?.pause(); this.resultBgm?.pause(); }
  resumeActive() { if (this.enabled) void this.setEnabled(true); }

  async setEnabled(enabled: boolean) {
    this.enabled = enabled;
    localStorage.setItem("twelve-sound", enabled ? "on" : "off");
    if (!enabled) {
      this.bgm?.pause();
      this.resultBgm?.pause();
      this.notify();
      return;
    }
    if (this.mode === "result") {
      this.resultBgm ??= Object.assign(new Audio("/audio/bgm/bgm_results.mp3"), { loop: true, volume: Math.min(0.32, this.volume + 0.08) });
      try { await this.resultBgm.play(); } catch { /* user gesture may be required */ }
      this.notify();
      return;
    }
    this.resultBgm?.pause();
    this.bgm ??= Object.assign(new Audio("/audio/bgm/bgm_class_arena.mp3"), {
      loop: true,
      volume: this.volume,
    });
    try {
      await this.bgm.play();
    } catch {
      // Mobile browsers may wait for the next direct user gesture.
    }
    this.notify();
  }

  cue(name: PremiumCue) {
    const sound = new Audio(files[name]);
    sound.volume = name === "victory" ? 0.62 : 0.5;
    void sound.play().catch(() => undefined);
  }

  tone(kind: "click" | "card" | "select" | "move" | "capture" | "save" | "error") {
    if (typeof AudioContext === "undefined") return;
    this.context ??= new AudioContext();
    const ctx = this.context;
    if (ctx.state === "suspended") void ctx.resume();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const settings = {
      click: [420, 540, 0.045],
      card: [330, 690, 0.11],
      select: [560, 720, 0.07],
      move: [310, 470, 0.1],
      capture: [190, 90, 0.16],
      save: [660, 990, 0.13],
      error: [180, 130, 0.18],
    }[kind];
    oscillator.type = kind === "capture" || kind === "error" ? "square" : "sine";
    oscillator.frequency.setValueAtTime(settings[0], now);
    oscillator.frequency.exponentialRampToValueAtTime(settings[1], now + settings[2]);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + settings[2]);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + settings[2] + 0.02);
  }
}

export const audio = new AudioDirector();
