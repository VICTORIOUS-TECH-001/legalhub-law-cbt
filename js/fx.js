/* =====================================================================
   FX LAYER — pure presentation, zero gameplay logic
   ---------------------------------------------------------------
   • Ambient neon particle field drifting behind the app (#bgFx canvas)
   • Confetti bursts on the top layer (#fxCanvas) for wins & rewards
   • Floating "+XP" popups when a practice answer is correct
   • Big combo banners ("3× COMBO!") during practice streaks
   • Screen shake on wrong answers and final countdowns

   Everything hooks in by *decorating* the existing window.SoundFX
   object (the very same Sound instance the game modules call), so no
   logic file is modified. All effects respect prefers-reduced-motion.
   ===================================================================== */

import { state } from './state.js';

const REDUCED = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
const NEON_COLORS = ['#ff8fd0', '#ffa9b0', '#b28cf7', '#57d3b8', '#69c3f2', '#ffc8e3', '#ffffff'];

/* ---------------- canvas setup ---------------- */
function makeCanvas(id) {
  let c = document.getElementById(id);
  if (!c) {
    c = document.createElement('canvas');
    c.id = id;
    document.body.appendChild(c);
  }
  const ctx2d = c.getContext('2d');
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = window.innerWidth * dpr;
    c.height = window.innerHeight * dpr;
    c.style.width = `${window.innerWidth}px`;
    c.style.height = `${window.innerHeight}px`;
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);
  return { c, ctx: ctx2d };
}

/* ---------------- ambient particle field ---------------- */
const bg = makeCanvas('bgFx');
const motes = [];
const MOTE_COUNT = REDUCED ? 0 : (window.innerWidth < 700 ? 34 : 64);

function seedMotes() {
  motes.length = 0;
  for (let i = 0; i < MOTE_COUNT; i++) {
    motes.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: 0.6 + Math.random() * 2.2,
      vy: -(0.08 + Math.random() * 0.35),
      vx: (Math.random() - 0.5) * 0.14,
      hue: Math.random() < 0.55 ? '255, 143, 208' : (Math.random() < 0.6 ? '178, 140, 247' : '105, 195, 242'),
      a: 0.15 + Math.random() * 0.5,
      tw: 0.4 + Math.random() * 2.2,
      ph: Math.random() * Math.PI * 2
    });
  }
}
seedMotes();

let bgT = 0;
function drawBg() {
  const { ctx } = bg;
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  bgT += 0.016;
  for (const m of motes) {
    m.y += m.vy; m.x += m.vx + Math.sin(bgT * m.tw + m.ph) * 0.12;
    if (m.y < -8) { m.y = window.innerHeight + 8; m.x = Math.random() * window.innerWidth; }
    if (m.x < -8) m.x = window.innerWidth + 8;
    if (m.x > window.innerWidth + 8) m.x = -8;
    const twinkle = 0.55 + 0.45 * Math.sin(bgT * m.tw * 1.7 + m.ph);
    ctx.beginPath();
    ctx.fillStyle = `rgba(${m.hue}, ${(m.a * twinkle).toFixed(3)})`;
    ctx.shadowColor = `rgba(${m.hue}, 0.8)`;
    ctx.shadowBlur = 6;
    ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  requestAnimationFrame(drawBg);
}
if (!REDUCED && MOTE_COUNT) requestAnimationFrame(drawBg);

/* ---------------- confetti / pop layer ---------------- */
const fx = makeCanvas('fxCanvas');
const bits = [];
let fxRunning = false;

function spawnConfetti(x, y, count = 90, power = 1) {
  if (REDUCED) return;
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const speed = (2.5 + Math.random() * 7.5) * power;
    bits.push({
      x, y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed - 3.5 * power,
      g: 0.16 + Math.random() * 0.1,
      w: 4 + Math.random() * 6,
      h: 3 + Math.random() * 5,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.35,
      color: NEON_COLORS[(Math.random() * NEON_COLORS.length) | 0],
      life: 1,
      decay: 0.008 + Math.random() * 0.01,
      glow: Math.random() < 0.35
    });
  }
  if (!fxRunning) { fxRunning = true; requestAnimationFrame(drawFx); }
}

function confettiCannons() {
  if (REDUCED) return;
  const h = window.innerHeight;
  spawnConfetti(window.innerWidth * 0.06, h * 0.98, 130, 1.5);
  spawnConfetti(window.innerWidth * 0.94, h * 0.98, 130, 1.5);
  setTimeout(() => spawnConfetti(window.innerWidth * 0.5, h * 0.4, 90, 1.1), 260);
}

function drawFx() {
  const { ctx } = fx;
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  for (let i = bits.length - 1; i >= 0; i--) {
    const b = bits[i];
    b.vy += b.g; b.vx *= 0.992; b.x += b.vx; b.y += b.vy; b.rot += b.vr; b.life -= b.decay;
    if (b.life <= 0 || b.y > window.innerHeight + 30) { bits.splice(i, 1); continue; }
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);
    ctx.globalAlpha = Math.max(0, Math.min(1, b.life));
    if (b.glow) { ctx.shadowColor = b.color; ctx.shadowBlur = 10; }
    ctx.fillStyle = b.color;
    ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
    ctx.restore();
  }
  if (bits.length) requestAnimationFrame(drawFx);
  else { fxRunning = false; ctx.clearRect(0, 0, window.innerWidth, window.innerHeight); }
}

/* ---------------- floating XP popup ---------------- */
function floatXp(text, { x, y, combo = false } = {}) {
  if (REDUCED) return;
  const el = document.createElement('div');
  el.className = 'xp-float' + (combo ? ' xp-combo' : '');
  el.textContent = text;
  const px = x ?? window.innerWidth / 2 + (Math.random() * 120 - 60);
  const py = y ?? window.innerHeight * 0.42;
  el.style.left = `${px}px`;
  el.style.top = `${py}px`;
  el.style.transform = 'translateX(-50%)';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1300);
}

function anchorOfCorrectOption() {
  const el = document.querySelector('.option.is-correct');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/* ---------------- combo banner ---------------- */
function comboBanner(n) {
  if (REDUCED) return;
  const el = document.createElement('div');
  el.className = 'combo-banner';
  el.textContent = `${n}× combo!`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

/* ---------------- screen shake ---------------- */
function shake() {
  if (REDUCED) return;
  document.body.classList.remove('fx-shake');
  void document.body.offsetWidth; // restart the animation
  document.body.classList.add('fx-shake');
  setTimeout(() => document.body.classList.remove('fx-shake'), 500);
}

/* ---------------- hook into the existing Sound object ----------------
   window.SoundFX IS the Sound singleton every module calls, so wrapping
   its methods adds visuals without touching any logic file.          */
function installHooks() {
  const S = window.SoundFX;
  if (!S || S.__fxHooked) return;
  S.__fxHooked = true;

  const wrap = (name, effect) => {
    const orig = S[name]?.bind(S);
    if (!orig) return;
    S[name] = function (...args) {
      try { effect(); } catch { /* visuals never break the game */ }
      return orig(...args);
    };
  };

  wrap('success', () => {
    const anchor = anchorOfCorrectOption();
    spawnConfetti(anchor?.x ?? window.innerWidth / 2, anchor?.y ?? window.innerHeight / 2, 70, 0.9);
    const combo = state.practiceCombo || 0;
    if (state.practiceActive) {
      const gained = 100 + Math.min(combo, 10) * 10;
      floatXp(`+${gained} XP`, anchor ? { x: anchor.x, y: anchor.y - 30 } : {});
      if (combo >= 3) comboBanner(combo);
    }
  });

  wrap('error', shake);
  wrap('explosion', shake);
  wrap('countdownFinal', shake);

  wrap('coin', () => {
    floatXp('★ bonus', { combo: true });
    spawnConfetti(window.innerWidth / 2, window.innerHeight * 0.3, 40, 0.8);
  });

  wrap('powerUp', () => {
    spawnConfetti(window.innerWidth / 2, window.innerHeight * 0.35, 110, 1.15);
  });

  wrap('levelUp', confettiCannons);

  wrap('submit', () => {
    spawnConfetti(window.innerWidth / 2, window.innerHeight * 0.25, 60, 1);
  });
}

/* Sound.js evaluates before fx.js (imported earlier by nav.js), but hook
   defensively on DOM ready too in case load order ever changes. */
installHooks();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installHooks);

export const FX = { spawnConfetti, confettiCannons, floatXp, comboBanner, shake };
window.GameFX = FX;
