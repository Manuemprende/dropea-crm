// Shopify Sale Notification Sound (Official MP3 loader + High-fidelity Web Audio Synthesizer fallback)

let audioCtx: AudioContext | null = null;
let preloadedAudio: HTMLAudioElement | null = null;

if (typeof window !== 'undefined') {
  try {
    preloadedAudio = new Audio('/sonido-shopify.mp3');
    preloadedAudio.preload = 'auto';
    preloadedAudio.volume = 1.0;
    preloadedAudio.load();
  } catch {}

  // Unlock audio playback on first user touch / pointer gesture (critical for mobile browsers)
  const unlockAudio = () => {
    try {
      if (preloadedAudio) {
        preloadedAudio.load();
      }
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch {}
  };
  window.addEventListener('pointerdown', unlockAudio, { once: true, passive: true });
  window.addEventListener('keydown', unlockAudio, { once: true, passive: true });
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtxClass) return null;
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioCtxClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export async function playSaleSound(): Promise<void> {
  // 1. Trigger mobile vibration pattern (Shopify double-haptic)
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([180, 80, 240]);
    } catch {}
  }

  // 2. Try playing official user-provided Shopify MP3
  if (preloadedAudio) {
    try {
      preloadedAudio.currentTime = 0;
      const playPromise = preloadedAudio.play();
      if (playPromise !== undefined) {
        await playPromise;
        return;
      }
    } catch {}
  }

  const candidateUrls = [
    '/sonido-shopify.mp3',
    '/shopify.mp3',
    '/shopify-sound.mp3',
    '/sound.mp3'
  ];

  for (const url of candidateUrls) {
    try {
      const audio = new Audio(url);
      audio.volume = 1.0;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        await playPromise;
        return; // Successfully played uploaded mp3!
      }
    } catch {
      // Continue to next or fallback
    }
  }

  // 3. Fallback: Procedural Shopify "Cha-Ching" Cash Register Chime via Web Audio API
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // --- Part A: Initial Mechanical "Ka-" click & coin drop (0.00s - 0.08s) ---
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(320, now);
    clickOsc.frequency.exponentialRampToValueAtTime(80, now + 0.05);

    clickGain.gain.setValueAtTime(0.4, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    clickOsc.connect(clickGain);
    clickGain.connect(ctx.destination);
    clickOsc.start(now);
    clickOsc.stop(now + 0.06);

    // Coin rattle
    const coinOsc = ctx.createOscillator();
    const coinGain = ctx.createGain();
    coinOsc.type = 'sine';
    coinOsc.frequency.setValueAtTime(1860, now + 0.02);
    coinOsc.frequency.setValueAtTime(2480, now + 0.04);
    coinGain.gain.setValueAtTime(0, now);
    coinGain.gain.setValueAtTime(0.3, now + 0.02);
    coinGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    coinOsc.connect(coinGain);
    coinGain.connect(ctx.destination);
    coinOsc.start(now + 0.02);
    coinOsc.stop(now + 0.1);

    // --- Part B: The Signature Bright Resonant Bell "Ching!" (0.07s - 1.4s) ---
    // Two resonant high-pitched bell tones (C7 2093Hz + E7 2637Hz) with sparkling high octave (C8 4186Hz)
    const tones = [
      { freq: 2093.0, gain: 0.55, decay: 1.35 },
      { freq: 2637.0, gain: 0.40, decay: 1.15 },
      { freq: 3135.9, gain: 0.25, decay: 0.95 },
      { freq: 4186.0, gain: 0.20, decay: 0.70 }
    ];

    const bellStart = now + 0.06;

    tones.forEach(({ freq, gain, decay }) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, bellStart);

      g.gain.setValueAtTime(0.001, now);
      g.gain.setValueAtTime(gain, bellStart);
      g.gain.exponentialRampToValueAtTime(0.0001, bellStart + decay);

      osc.connect(g);
      g.connect(ctx.destination);

      osc.start(bellStart);
      osc.stop(bellStart + decay + 0.05);
    });
  } catch (err) {
    console.warn('Web Audio synthesis error:', err);
  }
}
