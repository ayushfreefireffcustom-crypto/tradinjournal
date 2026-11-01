// Per-device "play a sound for new notifications" setting (C6.5). Stored in
// localStorage, which can be unavailable (private mode, blocked storage), so
// every access is guarded and the default is off.
const KEY = 'tl.notifSound';

export function getSoundOn(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setSoundOn(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // Storage blocked: the toggle still works until the page reloads.
  }
  if (on) playChime();
}

let ctx: AudioContext | null = null;

/** A short two-note chime made in Web Audio, so there is no sound file to load. */
export function playChime(): void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    const t = ctx.currentTime;
    for (const [i, freq] of [880, 1320].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = t + i * 0.12;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.26);
    }
  } catch {
    // Autoplay rules or no audio device: silently skip.
  }
}
