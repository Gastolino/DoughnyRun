import type { Grade } from "./logic/tuning";

// Every sound in the game, synthesised with the Web Audio API: no files to
// load. Browsers only let a page make sound after the player has touched or
// pressed something, so the audio starts on the first press, and nothing
// plays before then. The mute setting is remembered between visits.

const MUTE_KEY = "doughnyrun.muted";
const MASTER = 0.45;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Starts the audio on the first press anywhere; call once at start-up. */
export function unlockAudioOnFirstPress(): void {
  const start = () => {
    ensure();
    void ctx?.resume();
  };
  for (const type of ["pointerdown", "keydown", "touchend"]) {
    window.addEventListener(type, start, { capture: true, passive: true });
  }
}

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  master = ctx.createGain();
  master.gain.value = muted ? 0 : MASTER;
  master.connect(ctx.destination);
  // One second of white noise, reused for every hiss, crunch and whoosh.
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    window.localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    // Storage unavailable: the setting lasts until the page reloads.
  }
  if (ctx && master) master.gain.setTargetAtTime(value ? 0 : MASTER, ctx.currentTime, 0.02);
}

/** The context, when sound can play right now. */
function live(): AudioContext | null {
  if (muted || !ctx || !master || ctx.state !== "running") return null;
  return ctx;
}

interface ToneOptions {
  type?: OscillatorType;
  from: number;
  to?: number;
  duration: number;
  volume?: number;
  delay?: number;
  attack?: number;
}

/** A pitched note, optionally sliding, with a quick fade in and a fade out. */
function tone({ type = "sine", from, to = from, duration, volume = 0.5, delay = 0, attack = 0.005 }: ToneOptions): void {
  const c = live();
  if (!c || !master) return;
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + duration);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

interface NoiseOptions {
  filter: BiquadFilterType;
  from: number;
  to?: number;
  q?: number;
  duration: number;
  volume?: number;
  delay?: number;
}

/** A burst of filtered noise: hiss, crunch or whoosh depending on the filter. */
function hiss({ filter, from, to = from, q = 1, duration, volume = 0.4, delay = 0 }: NoiseOptions): AudioBufferSourceNode | null {
  const c = live();
  if (!c || !master || !noise) return null;
  const t = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + duration);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  src.connect(f).connect(gain).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + duration + 0.02);
  return src;
}

// A major pentatonic scale, so that any run of chimes sounds pleasant.
const PENTATONIC = [0, 2, 4, 7, 9];
const note = (step: number, base = 523.25): number =>
  base * 2 ** ((PENTATONIC[((step % 5) + 5) % 5] + 12 * Math.floor(step / 5)) / 12);

export const sound = {
  jump(): void {
    tone({ type: "triangle", from: 260, to: 620, duration: 0.14, volume: 0.35 });
  },
  airJump(): void {
    tone({ type: "triangle", from: 480, to: 980, duration: 0.14, volume: 0.3 });
    hiss({ filter: "highpass", from: 3000, duration: 0.12, volume: 0.12 });
  },
  land(): void {
    tone({ from: 150, to: 60, duration: 0.1, volume: 0.35 });
    hiss({ filter: "lowpass", from: 900, to: 300, duration: 0.08, volume: 0.2 });
  },
  launch(): void {
    tone({ type: "sine", from: 300, to: 900, duration: 0.25, volume: 0.25 });
  },
  boost(): void {
    hiss({ filter: "bandpass", from: 400, to: 4000, q: 2, duration: 0.45, volume: 0.35 });
    tone({ type: "sawtooth", from: 220, to: 880, duration: 0.35, volume: 0.12 });
  },

  /** A sizzle while a sausage slides through; returns a function that stops it. */
  grind(): () => void {
    const src = hiss({ filter: "bandpass", from: 3200, q: 0.8, duration: 4, volume: 0.1 });
    return () => {
      try {
        src?.stop();
      } catch {
        // Already stopped.
      }
    };
  },

  /** A chime for each grade, climbing the scale as the chain grows. */
  grade(grade: Grade, chain: number): void {
    const step = Math.min(chain, 12);
    switch (grade) {
      case "perfect":
        [0, 2, 4].forEach((k, i) => tone({ type: "triangle", from: note(step + k), duration: 0.22, volume: 0.28, delay: i * 0.06 }));
        tone({ type: "sine", from: note(step + 7), duration: 0.35, volume: 0.15, delay: 0.18 });
        break;
      case "great":
        [0, 2].forEach((k, i) => tone({ type: "triangle", from: note(step + k), duration: 0.2, volume: 0.26, delay: i * 0.07 }));
        break;
      case "good":
        tone({ type: "triangle", from: note(step), duration: 0.18, volume: 0.24 });
        break;
      case "sloppy":
        tone({ type: "square", from: 180, to: 140, duration: 0.2, volume: 0.12 });
        break;
    }
  },

  /** The sunglasses take a crash. */
  save(): void {
    hiss({ filter: "highpass", from: 2500, duration: 0.3, volume: 0.3 });
    tone({ type: "square", from: 1400, to: 700, duration: 0.25, volume: 0.1 });
  },
  bonk(): void {
    tone({ type: "square", from: 220, to: 90, duration: 0.25, volume: 0.25 });
  },
  fall(): void {
    tone({ type: "sine", from: 900, to: 150, duration: 0.8, volume: 0.3 });
  },
  splat(): void {
    hiss({ filter: "lowpass", from: 1200, to: 200, duration: 0.25, volume: 0.45 });
    tone({ from: 120, to: 50, duration: 0.2, volume: 0.35 });
  },
  /** One bite out of the doughnut. */
  crunch(): void {
    hiss({ filter: "bandpass", from: 1800 + Math.random() * 800, q: 1.5, duration: 0.09, volume: 0.45 });
  },
  /** The dentures' teeth knocking together. */
  clack(volume = 0.25): void {
    hiss({ filter: "highpass", from: 3500, duration: 0.025, volume });
    tone({ type: "square", from: 1900, to: 1600, duration: 0.025, volume: volume * 0.3 });
  },
  /** A police siren, rising and falling twice. */
  siren(): void {
    for (let i = 0; i < 4; i++) {
      tone({ type: "square", from: i % 2 ? 950 : 700, to: i % 2 ? 700 : 950, duration: 0.3, volume: 0.12, delay: i * 0.3, attack: 0.02 });
    }
  },
  fanfare(): void {
    [0, 2, 4, 5].forEach((k, i) => tone({ type: "triangle", from: note(k, 392), duration: i === 3 ? 0.6 : 0.16, volume: 0.3, delay: i * 0.13 }));
    tone({ type: "sine", from: note(5, 196), duration: 0.8, volume: 0.2, delay: 0.39 });
  },
  /** Floating on marshmallow: a soft, airy whoosh. */
  float(): void {
    hiss({ filter: "bandpass", from: 900, to: 500, q: 0.7, duration: 0.7, volume: 0.18 });
    tone({ type: "sine", from: 520, to: 440, duration: 0.5, volume: 0.08 });
  },
  click(): void {
    tone({ type: "triangle", from: 900, duration: 0.05, volume: 0.15 });
  },
};
