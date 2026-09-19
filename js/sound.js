/* ===== UI SOUND FEEDBACK (Web Audio, synthesised — no asset downloads) ===== */
let audioCtx = null;
let audioUnsupported = false;
let soundEnabled = true;
let masterGain = null;

try {
  const saved = localStorage.getItem('vt_sound_enabled');
  if (saved !== null) soundEnabled = saved === 'true';
} catch { /* storage unavailable */ }

function ensureAudio() {
  if (audioUnsupported) return null;
  if (!audioCtx) {
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) throw new Error('AudioContext unavailable');
      audioCtx = new Ctor();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.3;
      masterGain.connect(audioCtx.destination);
    } catch (e) {
      audioUnsupported = true;
      console.warn('Web Audio not supported — sound feedback disabled.', e?.message || e);
      return null;
    }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

function tone({ freq = 440, type = 'sine', duration = 0.15, volume = 0.5, attack = 0.01, decay = 0.15, glideTo = null, glideTime = 0.1, delay = 0 }) {
  if (!soundEnabled) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  const now = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 4000;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (glideTo) osc.frequency.linearRampToValueAtTime(glideTo, now + glideTime);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.001, now + attack + decay);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + attack + decay + 0.05);
}

export const Sound = {
  get enabled() { return soundEnabled; },
  set enabled(v) {
    soundEnabled = !!v;
    localStorage.setItem('vt_sound_enabled', String(soundEnabled));
    if (soundEnabled) ensureAudio();
    window.updateSoundToggleUI?.();
  },
  toggle() { this.enabled = !this.enabled; return this.enabled; },

  click() {
    tone({ freq: 900, type: 'square', duration: 0.08, volume: 0.25, attack: 0.002, decay: 0.08 });
    tone({ freq: 1200, type: 'sine', duration: 0.06, volume: 0.15, attack: 0.001, decay: 0.06, delay: 0.02 });
  },
  hover() {
    tone({ freq: 600, type: 'sine', duration: 0.06, volume: 0.08, attack: 0.001, decay: 0.05 });
  },
  tap() {
    tone({ freq: 700, type: 'triangle', duration: 0.07, volume: 0.2, attack: 0.002, decay: 0.07 });
  },
  success() {
    tone({ freq: 400, type: 'sine', volume: 0.4, attack: 0.01, decay: 0.2, glideTo: 800, glideTime: 0.15 });
    tone({ freq: 600, type: 'sine', volume: 0.35, attack: 0.01, decay: 0.25, delay: 0.12, glideTo: 1200, glideTime: 0.15 });
    tone({ freq: 900, type: 'triangle', volume: 0.3, attack: 0.01, decay: 0.4, delay: 0.22 });
  },
  error() {
    tone({ freq: 300, type: 'sawtooth', volume: 0.3, attack: 0.01, decay: 0.25, glideTo: 120, glideTime: 0.2 });
    tone({ freq: 150, type: 'square', volume: 0.25, attack: 0.005, decay: 0.3, delay: 0.08 });
  },
  powerUp() {
    [0, 0.1, 0.2, 0.35].forEach((d, i) => {
      tone({ freq: 300 + i * 200, type: 'sine', volume: 0.35, attack: 0.02, decay: 0.3, delay: d, glideTo: 500 + i * 250, glideTime: 0.2 });
    });
    tone({ freq: 1200, type: 'triangle', volume: 0.4, attack: 0.01, decay: 0.6, delay: 0.45 });
  },
  levelUp() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => tone({ freq: f, type: 'sine', volume: 0.35, attack: 0.01, decay: 0.35, delay: i * 0.12 }));
  },
  select() {
    tone({ freq: 500, type: 'triangle', volume: 0.3, attack: 0.005, decay: 0.12, glideTo: 900, glideTime: 0.08 });
  },
  submit() {
    tone({ freq: 200, type: 'sine', volume: 0.4, attack: 0.02, decay: 0.4, glideTo: 600, glideTime: 0.3 });
    tone({ freq: 800, type: 'sine', volume: 0.35, attack: 0.01, decay: 0.5, delay: 0.2 });
  },
  countdown() {
    tone({ freq: 800, type: 'square', volume: 0.25, attack: 0.001, decay: 0.15 });
  },
  countdownFinal() {
    tone({ freq: 400, type: 'sawtooth', volume: 0.4, attack: 0.001, decay: 0.6 });
    tone({ freq: 200, type: 'sine', volume: 0.35, attack: 0.001, decay: 0.8, delay: 0.1 });
  },
  typing() {
    const f = 800 + Math.random() * 400;
    tone({ freq: f, type: 'square', volume: 0.06, attack: 0.001, decay: 0.03 });
  },
  coin() {
    tone({ freq: 800, type: 'sine', volume: 0.4, attack: 0.005, decay: 0.15, glideTo: 1600, glideTime: 0.12 });
    tone({ freq: 1200, type: 'sine', volume: 0.25, attack: 0.005, decay: 0.2, delay: 0.08 });
  },
  whoosh() {
    if (!soundEnabled) return;
    const ctx = ensureAudio(); if (!ctx) return;
    const now = ctx.currentTime;
    const bufferSize = ctx.sampleRate * 0.25;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    const src = ctx.createBufferSource(); src.buffer = buffer;
    const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 1200; filter.Q.value = 1;
    const gain = ctx.createGain(); gain.gain.setValueAtTime(0.25, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    src.connect(filter); filter.connect(gain); gain.connect(masterGain);
    src.start(now);
  },
  explosion() {
    tone({ freq: 100, type: 'sawtooth', volume: 0.5, attack: 0.001, decay: 0.4, glideTo: 30, glideTime: 0.35 });
    tone({ freq: 300, type: 'square', volume: 0.3, attack: 0.001, decay: 0.2, delay: 0.02 });
  }
};

// Global UI helper
window.updateSoundToggleUI = function() {
  const btns = document.querySelectorAll('.sound-toggle');
  btns.forEach(b => {
    b.classList.toggle('muted', !soundEnabled);
    b.textContent = soundEnabled ? '🔊' : '🔇';
    b.title = soundEnabled ? 'Sound on — click to mute' : 'Sound off — click to unmute';
    b.setAttribute('aria-pressed', String(soundEnabled));
  });
};

// Auto attach to buttons after DOM ready
function attachGlobalSounds() {
  document.addEventListener('click', (e) => {
    const target = e.target.closest('button, .option, .course-card, .nav-q-btn, .topic-row, .flashcard');
    if (!target) return;
    if (target.classList.contains('sound-toggle')) return; // handled separately
    if (target.matches('.option')) Sound.select();
    else if (target.matches('.nav-q-btn')) Sound.tap();
    else Sound.click();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attachGlobalSounds);
else attachGlobalSounds();

// Expose globally for non-module usage
window.SoundFX = Sound;
window.toggleSound = () => Sound.toggle();
