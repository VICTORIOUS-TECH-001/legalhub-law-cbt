export function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>]/g, m => {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    return '&gt;';
  });
}

export function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
  el.className = `game-toast ${type}`;
  el.textContent = msg;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 350);
  }, 2800);
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
