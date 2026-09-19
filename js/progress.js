const KEY = (reg) => 'vt_progress_v1_' + String(reg || '').toUpperCase();

function blank() {
  return { xp: 0, streak: 0, lastPlay: null, battles: 0, correct: 0, comboBest: 0 };
}

export function getProgress(reg) {
  if (!reg) return blank();
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY(reg)) || 'null');
    return parsed && typeof parsed === 'object' ? { ...blank(), ...parsed } : blank();
  } catch {
    return blank();
  }
}

function saveProgress(reg, data) {
  localStorage.setItem(KEY(reg), JSON.stringify(data));
  return data;
}

function sameDay(a, b) {
  if (!a || !b) return false;
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function yesterdayOf(iso) {
  const d = new Date(iso);
  d.setDate(d.getDate() - 1);
  return d.toISOString();
}

export function recordLogin(reg) {
  const p = getProgress(reg);
  const now = new Date().toISOString();
  if (!p.lastPlay) {
    p.streak = 1;
  } else if (sameDay(p.lastPlay, now)) {
    // already counted today
  } else if (sameDay(p.lastPlay, yesterdayOf(now))) {
    p.streak += 1;
  } else {
    p.streak = 1;
  }
  p.lastPlay = now;
  p.xp += 25;
  return saveProgress(reg, p);
}

export function addXp(reg, amount, { correct = false, battle = false, combo = 0 } = {}) {
  const p = getProgress(reg);
  p.xp += Math.max(0, amount | 0);
  if (correct) p.correct += 1;
  if (battle) p.battles += 1;
  if (combo > (p.comboBest || 0)) p.comboBest = combo;
  p.lastPlay = new Date().toISOString();
  return saveProgress(reg, p);
}

/** Progression tiers shown in the top bar and dashboard. */
export function rankForXp(xp) {
  if (xp >= 12000) return { title: 'Senior Counsel', color: '#ff8a5c' };
  if (xp >= 6000) return { title: 'Counsel', color: '#e855a4' };
  if (xp >= 2500) return { title: 'Associate', color: '#a585e6' };
  if (xp >= 800) return { title: 'Junior Associate', color: '#6aa8d6' };
  return { title: 'Fresher', color: '#8d9bbd' };
}

export function formatXp(xp) {
  return Number(xp || 0).toLocaleString();
}
