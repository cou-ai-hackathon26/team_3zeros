/** Short double-beep generated with Web Audio, so there is no audio file to ship. Returns a stop function. */
export function startRingtone(): () => void {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return () => undefined;
  let ctx: AudioContext;
  try {
    ctx = new AudioContext();
  } catch {
    return () => undefined;
  }
  const beep = (at: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 440;
    gain.gain.setValueAtTime(0, ctx.currentTime + at);
    gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + at + 0.02);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + at + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime + at);
    osc.stop(ctx.currentTime + at + 0.45);
  };
  const ring = () => {
    beep(0);
    beep(0.5);
  };
  ring();
  const timer = setInterval(ring, 3000);
  return () => {
    clearInterval(timer);
    void ctx.close().catch(() => undefined);
  };
}
