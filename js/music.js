/* =====================================================================
   MUSIC ENGINE — downloaded gaming background music (HTML5 audio)
   ---------------------------------------------------------------
   Real, catchy game music files live in assets/music/ and are played
   through <audio> elements. No synthesis here — the tracks are properly
   mastered loops that keep people's attention.

   Tracks:
     • lobby  — "Bit Bit Loop" (Kevin MacLeod) cheerful 8-bit chiptune
                for menus, dashboard & flashcards
     • battle — "Cipher" (Kevin MacLeod) driving electronic pulse for
                timed exams

   Behaviour is unchanged from before:
     • playback starts on the first user gesture (autoplay rules)
     • the track switches automatically with body classes (focus-mode)
     • the 🎵 toggle button mutes/unmutes and the choice is remembered
     • music ducks while the tab is hidden

   Music: "Bit Bit Loop" & "Cipher" — Kevin MacLeod (incompetech.com)
   Licensed under Creative Commons: By Attribution 4.0
   https://creativecommons.org/licenses/by/4.0/
   ===================================================================== */

let started = false;
let musicEnabled = true;
let currentTrack = null;   // 'lobby' | 'battle'

const FADE_MS = 600;       // crossfade length between tracks
const FADE_STEP_MS = 40;   // fade tick

try {
  const saved = localStorage.getItem('lh_music_enabled');
  if (saved !== null) musicEnabled = saved === 'true';
} catch { /* storage unavailable */ }

/* ---------------- track definitions (downloaded files) ---------------- */
const TRACKS = {
  lobby:  { file: 'assets/music/lobby-bit-bit-loop.mp3', volume: 0.55, broken: false, audio: null, fade: null },
  battle: { file: 'assets/music/battle-cipher.mp3',      volume: 0.5,  broken: false, audio: null, fade: null }
};

function getAudio(name) {
  const track = TRACKS[name];
  if (!track || track.broken) return null;
  if (track.audio) return track.audio;
  try {
    const audio = new Audio(track.file);
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0;
    audio.addEventListener('error', () => { track.broken = true; });
    track.audio = audio;
    return audio;
  } catch {
    track.broken = true;
    return null;
  }
}

/* smooth volume fade; pauses the element once it reaches silence */
function fadeTo(name, target, ms = FADE_MS, { pauseAtZero = true } = {}) {
  const track = TRACKS[name];
  const audio = getAudio(name);
  if (!audio) return;
  if (track.fade) { clearInterval(track.fade); track.fade = null; }
  const from = audio.volume;
  const delta = target - from;
  if (Math.abs(delta) < 0.01) {
    audio.volume = target;
    if (target === 0 && pauseAtZero) audio.pause();
    return;
  }
  const steps = Math.max(1, Math.round(ms / FADE_STEP_MS));
  let i = 0;
  track.fade = setInterval(() => {
    i += 1;
    const t = Math.min(1, i / steps);
    // ease in-out so the crossfade feels musical
    const k = t * t * (3 - 2 * t);
    audio.volume = Math.min(1, Math.max(0, from + delta * k));
    if (t >= 1) {
      clearInterval(track.fade);
      track.fade = null;
      if (target === 0 && pauseAtZero) audio.pause();
    }
  }, FADE_STEP_MS);
}

function playTrack(name) {
  const track = TRACKS[name];
  const audio = getAudio(name);
  if (!audio || !track) return;
  const p = audio.play();
  if (p && typeof p.catch === 'function') p.catch(() => { /* autopolay lock — next gesture retries */ });
  fadeTo(name, track.volume, FADE_MS, { pauseAtZero: false });
}

function stopTrack(name) {
  if (!TRACKS[name] || !TRACKS[name].audio) return;
  fadeTo(name, 0, FADE_MS, { pauseAtZero: true });
}

function desiredTrack() {
  const b = document.body.classList;
  if (b.contains('focus-mode')) return 'battle';
  return 'lobby';
}

function setTrack(name) {
  if (!TRACKS[name] || currentTrack === name) return;
  if (currentTrack) stopTrack(currentTrack);
  currentTrack = name;
  if (started && musicEnabled && !document.hidden) playTrack(name);
}

export const Music = {
  get enabled() { return musicEnabled; },
  get track() { return currentTrack; },

  /** Call from a user gesture — boots playback if allowed. */
  start() {
    if (!started) {
      started = true;
      currentTrack = desiredTrack();
    }
    if (!musicEnabled || document.hidden) return;
    // make sure the current track is actually playing (first gesture after
    // a focus-mode switch, or a retry after an autoplay rejection)
    const audio = getAudio(currentTrack);
    if (audio && audio.paused) {
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
    if (TRACKS[currentTrack] && TRACKS[currentTrack].audio) {
      fadeTo(currentTrack, TRACKS[currentTrack].volume, FADE_MS, { pauseAtZero: false });
    }
  },

  set enabled(v) {
    musicEnabled = !!v;
    try { localStorage.setItem('lh_music_enabled', String(musicEnabled)); } catch { /* ignore */ }
    if (musicEnabled) {
      this.start();
    } else if (currentTrack) {
      stopTrack(currentTrack);
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

/* duck the music while the tab is hidden to save battery */
document.addEventListener('visibilitychange', () => {
  if (!started || !currentTrack) return;
  if (document.hidden) {
    if (TRACKS[currentTrack].audio && !TRACKS[currentTrack].audio.paused) {
      TRACKS[currentTrack].audio.pause();
    }
  } else if (musicEnabled) {
    playTrack(currentTrack);
  }
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
