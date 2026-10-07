/**
 * Two-note chime with a soft attack and release.
 * The previous version was a bare 880 Hz square burst — startling in a quiet
 * classroom. This is deliberately gentle: a fifth, fading out.
 */
export function chime(volume = 0.07) {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const notes: Array<[number, number]> = [
      [660, 0],
      [990, 0.16],
    ];
    for (const [freq, delay] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t = now + delay;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
      osc.start(t);
      osc.stop(t + 0.8);
    }
    window.setTimeout(() => ctx.close().catch(() => {}), 1400);
  } catch {
    // no audio device / autoplay blocked: silence is an acceptable outcome
  }
}
