type PremiumCue = "start" | "victory" | "promote";

const files: Record<PremiumCue, string> = {
  start: "/audio/sfx/game_start.wav",
  victory: "/audio/sfx/match_victory.wav",
  promote: "/audio/sfx/piece_promote.wav",
};

class AudioDirector {
  private context: AudioContext | null = null;
  private bgm: HTMLAudioElement | null = null;
  private enabled = false;
  private volume = 0.16;

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

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    localStorage.setItem("twelve-volume", String(this.volume));
    if (this.bgm) this.bgm.volume = this.volume;
  }

  async setEnabled(enabled: boolean) {
    this.enabled = enabled;
    localStorage.setItem("twelve-sound", enabled ? "on" : "off");
    if (!enabled) {
      this.bgm?.pause();
      return;
    }
    this.bgm ??= Object.assign(new Audio("/audio/bgm/bgm_class_arena.mp3"), {
      loop: true,
      volume: this.volume,
    });
    try {
      await this.bgm.play();
    } catch {
      // Mobile browsers may wait for the next direct user gesture.
    }
  }

  cue(name: PremiumCue) {
    const sound = new Audio(files[name]);
    sound.volume = name === "victory" ? 0.62 : 0.5;
    void sound.play().catch(() => undefined);
  }

  tone(kind: "click" | "select" | "move" | "capture" | "save" | "error") {
    if (typeof AudioContext === "undefined") return;
    this.context ??= new AudioContext();
    const ctx = this.context;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const settings = {
      click: [420, 540, 0.045],
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
