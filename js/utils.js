export function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

/** Fisher–Yates shuffle (returns a new array). `rng` is injectable for tests. */
export function shuffleArray(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function pluralize(count, singular, plural = singular + 's') {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatTime(sec) {
  const mins = Math.floor(sec / 60), remSec = sec % 60;
  return `${mins.toString().padStart(2, '0')}:${remSec.toString().padStart(2, '0')}`;
}

export function normalizeReg(reg) {
  return String(reg || '').trim().toUpperCase();
}

export function compactReg(reg) {
  return normalizeReg(reg).replace(/[^A-Z0-9]/g, '');
}

export function prettyReg(reg) {
  const compact = compactReg(reg);
  if (/^\d{4}\d{5,}$/.test(compact)) return compact.slice(0, 4) + '/' + compact.slice(4);
  return normalizeReg(reg);
}

export function regsMatch(a, b) {
  const ca = compactReg(a), cb = compactReg(b);
  if (ca && cb && ca === cb) return true;
  const na = normalizeReg(a).replace(/[-_.\s]+/g, '/');
  const nb = normalizeReg(b).replace(/[-_.\s]+/g, '/');
  return !!(na && nb && na === nb);
}

export function toast(msg, type = 'info') {
  const host = document.getElementById('toastHost') || document.body;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', 'status');
  el.textContent = msg;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 350);
  }, 3000);
}

export function setBootStatus(text) {
  const el = document.getElementById('bootStatus');
  if (el) el.textContent = text;
}

export function hideBootScreen() {
  const boot = document.getElementById('bootScreen');
  if (!boot) return;
  boot.classList.add('boot-done');
  setTimeout(() => { boot.style.display = 'none'; }, 500);
}
