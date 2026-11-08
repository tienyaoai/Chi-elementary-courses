import { loadProgress } from "./progress.ts";

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!loadProgress().sound) return null;
  const Ctx = window.AudioContext;
  if (!Ctx) return null;
  if (!context) context = new Ctx();
  if (context.state === "suspended") void context.resume();
  return context;
}

function tone(frequency: number, when: number, duration: number, gain: number): void {
  const ctx = audio();
  if (!ctx) return;
  const oscillator = ctx.createOscillator();
  const amp = ctx.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.value = frequency;
  amp.gain.setValueAtTime(0.0001, when);
  amp.gain.exponentialRampToValueAtTime(gain, when + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  oscillator.connect(amp);
  amp.connect(ctx.destination);
  oscillator.start(when);
  oscillator.stop(when + duration + 0.02);
}

export function playCorrect(): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  tone(523, now, 0.12, 0.06);
  tone(659, now + 0.09, 0.12, 0.06);
  tone(784, now + 0.18, 0.22, 0.07);
}

export function playWrong(): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  tone(392, now, 0.12, 0.04);
  tone(330, now + 0.1, 0.16, 0.04);
}

export function playMatch(): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  tone(784, now, 0.1, 0.05);
  tone(988, now + 0.08, 0.16, 0.05);
}

export function playWin(): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  [523, 659, 784, 1046].forEach((frequency, index) => {
    tone(frequency, now + index * 0.12, 0.2, 0.06);
  });
}
