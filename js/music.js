/* =====================================================================
   MUSIC ENGINE — procedural arcade background music (Web Audio)
   ---------------------------------------------------------------
   No audio files, no downloads, no copyright: both soundtracks are
   synthesised live, note by note, by a 16th-step sequencer.

   Tracks:
     • lobby  — upbeat synthwave loop for menus, dashboard & flashcards
                (bouncy arpeggio lead, punchy kick, bright hats)
     • battle — focused, driving loop for timed exams
                (deep pulsing bass, tense minor pads, ticking hats)

   The track switches automatically with body classes (focus-mode) and
   playback starts on the first user gesture (browser autoplay rules).
   The 🎵 toggle button mutes/unmutes and the choice is remembered.
   ===================================================================== */

let ctx = null;
let musicGain = null;
let started = false;
let musicEnabled = true;
let currentTrack = null;   // 'lobby' | 'battle'
let timerId = null;

const LOOKAHEAD_MS = 25;      // scheduler wake-up
const SCHEDULE_AHEAD = 0.14;  // seconds of audio queued in advance

try {
  const saved = localStorage.getItem('lh_music_enabled');
  if (saved !== null) musicEnabled = saved === 'true';
} catch { /* storage unavailable */ }

/* ---------------- note helpers ---------------- */
const NOTE_RE = /^([A-G])(#|b)?(\d)$/;
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function ntf(name) {
  const m = NOTE_RE.exec(name);
  if (!m) return 0;
  let s = SEMI[m[1]];
  if (m[2] === '#') s += 1;
  if (m[2] === 'b') s -= 1;
  const midi = s + (parseInt(m[3], 10) + 1) * 12;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function ensureCtx() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    musicGain = ctx.createGain();
    musicGain.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 6;
    musicGain.connect(comp);
    comp.connect(ctx.destination);
    return ctx;
  } catch { return null; }
}

/* ---------------- instruments ---------------- */
function env(g, t, a, d, peak) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function kick(t, vol = 0.9) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
  env(g, t, 0.002, 0.22, vol);
  o.connect(g); g.connect(musicGain);
  o.start(t); o.stop(t + 0.3);
}

function snare(t, vol = 0.4) {
  const len = Math.floor(ctx.sampleRate * 0.12);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1600;
  const g = ctx.createGain(); env(g, t, 0.002, 0.11, vol);
  src.connect(f); f.connect(g); g.connect(musicGain);
  src.start(t);
}

function hat(t, vol = 0.16, open = false) {
  const len = Math.floor(ctx.sampleRate * (open ? 0.16 : 0.045));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, open ? 1.4 : 3);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7200;
  const g = ctx.createGain(); env(g, t, 0.001, open ? 0.15 : 0.04, vol);
  src.connect(f); f.connect(g); g.connect(musicGain);
  src.start(t);
}

function bass(t, freq, dur, vol = 0.5) {
  const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = 'sawtooth'; o.frequency.setValueAtTime(freq, t);
  f.type = 'lowpass';
  f.frequency.setValueAtTime(900, t);
  f.frequency.exponentialRampToValueAtTime(220, t + dur);
  env(g, t, 0.008, dur, vol);
  o.connect(f); f.connect(g); g.connect(musicGain);
  o.start(t); o.stop(t + dur + 0.08);
}

function lead(t, freq, dur, vol = 0.2, type = 'square') {
  const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  f.type = 'lowpass'; f.frequency.value = 5200;
  env(g, t, 0.01, dur, vol);
  o.connect(f); f.connect(g); g.connect(musicGain);
  o.start(t); o.stop(t + dur + 0.1);
  // detuned doubling for arcade sparkle
  const o2 = ctx.createOscillator(), g2 = ctx.createGain();
  o2.type = 'triangle'; o2.frequency.setValueAtTime(freq * 2, t); o2.detune.value = 6;
  env(g2, t, 0.012, dur * 0.8, vol * 0.35);
  o2.connect(g2); g2.connect(musicGain);
  o2.start(t); o2.stop(t + dur + 0.1);
}

function pad(t, freqs, dur, vol = 0.07) {
  freqs.forEach((fr, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = fr; o.detune.value = (i % 2 ? 7 : -7);
    f.type = 'lowpass'; f.frequency.value = 1500;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(vol * 0.8, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + dur + 0.1);
  });
}

/* ---------------- track definitions ----------------
   16th-note steps. One bar = 16 steps; loops below are 4 bars (64 steps).
------------------------------------------------------- */

// lobby: Am – F – C – G, bright & bouncy (Subway-Surfers-ish energy)
const LOBBY = {
  bpm: 126,
  bars: 4,
  chords: [
    ['A3', ['A4', 'C5', 'E5']],
    ['F3', ['F4', 'A4', 'C5']],
    ['C3', ['C4', 'E4', 'G4']],
    ['G3', ['G4', 'B4', 'D5']]
  ],
  // bass: root pulse with octave hops (per bar, 16 steps)
  bassPattern: [0, null, 0, null, 0, null, 12, null, 0, null, 0, null, 7, null, 12, null],
  // melody: [step, note, duration-in-steps]
  melody: [
    [0, 'E5', 2], [3, 'A5', 2], [6, 'C6', 2], [8, 'B5', 2], [11, 'A5', 3],
    [16, 'C5', 2], [19, 'F5', 2], [22, 'A5', 2], [24, 'G5', 2], [27, 'F5', 3],
    [32, 'E5', 2], [35, 'G5', 2], [38, 'C6', 2], [40, 'B5', 2], [43, 'G5', 3],
    [48, 'D5', 2], [51, 'G5', 2], [54, 'B5', 2], [56, 'A5', 4], [61, 'E5', 2]
  ],
  drums: { kick: [0, 6, 8, 14, 16, 22, 24, 30, 32, 38, 40, 46, 48, 54, 56, 62], snare: [4, 12, 20, 28, 36, 44, 52, 60], hat: 'eighth', openHat: [7, 15, 23, 31, 39, 47, 55, 63] },
  schedule(step, t) {
    const bar = Math.floor(step / 16) % this.bars;
    const s = step % 16;
    const [root, chord] = this.chords[bar];
    const spb = 60 / this.bpm / 4; // one 16th
    if (this.bassPattern[s] !== null && this.bassPattern[s] !== undefined) {
      bass(t, ntf(root) * Math.pow(2, this.bassPattern[s] / 12), spb * 1.6, 0.42);
    }
    if (s === 0) pad(t, chord.map(ntf), spb * 15, 0.05);
    this.melody.forEach(([ms, note, dur]) => {
      if (ms === step % 64) lead(t, ntf(note), dur * spb * 0.9, 0.14, 'square');
    });
    const d = this.drums;
    if (d.kick.includes(step % 64)) kick(t, 0.8);
    if (d.snare.includes(step % 64)) snare(t, 0.3);
    if (d.hat === 'eighth' && s % 2 === 0) hat(t, 0.1, false);
    if (d.openHat.includes(step % 64)) hat(t, 0.12, true);
  }
};

// battle: Dm – Bb – F – C, focused & driving (exam tension)
const BATTLE = {
  bpm: 100,
  bars: 4,
  chords: [
    ['D3', ['D4', 'F4', 'A4']],
    ['Bb2', ['Bb3', 'D4', 'F4']],
    ['F3', ['F4', 'A4', 'C5']],
    ['C3', ['C4', 'E4', 'G4']]
  ],
  bassPattern: [0, 0, null, 0, null, 0, null, 12, 0, 0, null, 0, null, 7, null, 0],
  melody: [
    [0, 'A4', 4], [8, 'D5', 4], [16, 'F4', 4], [24, 'Bb4', 4],
    [32, 'C5', 4], [40, 'A4', 4], [48, 'G4', 6], [58, 'A4', 4]
  ],
  drums: { kick: [0, 8, 16, 24, 32, 40, 48, 56], snare: [], hat: 'sixteenth', openHat: [] },
  schedule(step, t) {
    const bar = Math.floor(step / 16) % this.bars;
    const s = step % 16;
    const [root, chord] = this.chords[bar];
    const spb = 60 / this.bpm / 4;
    if (this.bassPattern[s] !== null && this.bassPattern[s] !== undefined) {
      bass(t, ntf(root) * Math.pow(2, this.bassPattern[s] / 12), spb * 1.2, 0.4);
    }
    if (s === 0) pad(t, chord.map(ntf), spb * 15.5, 0.065);
    this.melody.forEach(([ms, note, dur]) => {
      if (ms === step % 64) lead(t, ntf(note), dur * spb * 0.9, 0.085, 'triangle');
    });
    const d = this.drums;
    if (d.kick.includes(step % 64)) kick(t, 0.65);
    if (d.hat === 'sixteenth' && step % 2 === 1) hat(t, 0.045, false);
    if (d.hat === 'sixteenth' && s % 4 === 2) hat(t, 0.075, false);
  }
};

const TRACKS = { lobby: LOBBY, battle: BATTLE };

/* ---------------- scheduler ---------------- */
let nextStep = 0;
let nextStepTime = 0;

function scheduler() {
  if (!ctx || !currentTrack) return;
  const track = TRACKS[currentTrack];
  const spb = 60 / track.bpm / 4;
  while (nextStepTime < ctx.currentTime + SCHEDULE_AHEAD) {
    try { track.schedule(nextStep, nextStepTime); } catch { /* keep the loop alive */ }
    nextStep = (nextStep + 1) % (track.bars * 16);
    nextStepTime += spb;
  }
}

function fadeGainTo(value, seconds = 0.7) {
  if (!ctx || !musicGain) return;
  const now = ctx.currentTime;
  musicGain.gain.cancelScheduledValues(now);
  musicGain.gain.setValueAtTime(Math.max(musicGain.gain.value, 0.0001), now);
  musicGain.gain.linearRampToValueAtTime(Math.max(value, 0.0001), now + seconds);
}

function setTrack(name, { force = false } = {}) {
  if (!TRACKS[name] || (currentTrack === name && !force)) return;
  currentTrack = name;
  nextStep = 0;
  if (ctx) nextStepTime = ctx.currentTime + 0.06;
  if (started && musicEnabled) fadeGainTo(0.5, 0.4);
}

function desiredTrack() {
  const b = document.body.classList;
  if (b.contains('focus-mode')) return 'battle';
  return 'lobby';
}

export const Music = {
  get enabled() { return musicEnabled; },
  get track() { return currentTrack; },

  /** Call from a user gesture — boots the sequencer if allowed. */
  start() {
    const c = ensureCtx();
    if (!c) return;
    if (!timerId) timerId = setInterval(scheduler, LOOKAHEAD_MS);
    if (!started) {
      started = true;
      nextStep = 0;
      nextStepTime = c.currentTime + 0.08;
    }
    setTrack(desiredTrack(), { force: true });
    fadeGainTo(musicEnabled ? 0.5 : 0.0001, 1.1);
  },

  set enabled(v) {
    musicEnabled = !!v;
    try { localStorage.setItem('lh_music_enabled', String(musicEnabled)); } catch { /* ignore */ }
    if (musicEnabled) {
      this.start();
    } else {
      fadeGainTo(0.0001, 0.35);
    }
    window.updateMusicToggleUI?.();
  },
  get isOn() { return musicEnabled; },
  toggle() { this.enabled = !musicEnabled; return musicEnabled; }
};

/* ---------------- auto track switching ---------------- */
const bodyObserver = new MutationObserver(() => {
  setTrack(desiredTrack());
});
if (document.body) bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

/* start on the first user gesture (autoplay policy) */
['pointerdown', 'keydown', 'touchstart'].forEach(evt => {
  window.addEventListener(evt, () => { if (musicEnabled) Music.start(); }, { once: false, passive: true });
});

/* duck the music while the tab is hidden to save CPU */
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) fadeGainTo(0.0001, 0.3);
  else if (musicEnabled && started) fadeGainTo(0.5, 0.6);
});

/* ---------------- toggle UI ---------------- */
window.updateMusicToggleUI = function () {
  document.querySelectorAll('.music-toggle').forEach(b => {
    b.classList.toggle('muted', !musicEnabled);
    b.textContent = musicEnabled ? '🎵' : '🚫';
    b.title = musicEnabled ? 'Music on — click to mute' : 'Music off — click to unmute';
    b.setAttribute('aria-pressed', String(musicEnabled));
  });
};
window.toggleMusic = () => Music.toggle();

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => window.updateMusicToggleUI());
else window.updateMusicToggleUI();

window.MusicFX = Music;
