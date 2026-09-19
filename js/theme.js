/*
  THEME — background wallpaper selection
  --------------------------------------
  Wallpapers live in assets/wallpapers/. The active choice is stored per
  browser and applied as a CSS custom property that styles.css paints behind
  the UI (with a dark overlay so cards stay readable).
*/

const STORAGE_KEY = 'lh_wallpaper_v1';
const DEFAULT_ID = 'library';

export const WALLPAPERS = [
  { id: 'library', label: 'Law library', file: 'assets/wallpapers/library.jpg' },
  { id: 'scales', label: 'Scales of justice', file: 'assets/wallpapers/scales.jpg' },
  { id: 'courthouse', label: 'Courthouse', file: 'assets/wallpapers/courthouse.jpg' },
  { id: 'abstract', label: 'Navy silk', file: 'assets/wallpapers/abstract.jpg' },
  { id: 'none', label: 'Plain', file: null }
];

function readChoice() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return WALLPAPERS.some(w => w.id === saved) ? saved : DEFAULT_ID;
  } catch { return DEFAULT_ID; }
}

export function applyWallpaper(id, { persist = true } = {}) {
  const wallpaper = WALLPAPERS.find(w => w.id === id) || WALLPAPERS[0];
  const root = document.documentElement;
  if (wallpaper.file) {
    root.style.setProperty('--wallpaper', `url("${wallpaper.file}")`);
    root.classList.remove('no-wallpaper');
  } else {
    root.style.removeProperty('--wallpaper');
    root.classList.add('no-wallpaper');
  }
  if (persist) { try { localStorage.setItem(STORAGE_KEY, wallpaper.id); } catch { /* ignore */ } }
  document.querySelectorAll('.wallpaper-option').forEach(btn => {
    btn.classList.toggle('is-active', btn.getAttribute('data-wallpaper') === wallpaper.id);
    btn.setAttribute('aria-pressed', String(btn.getAttribute('data-wallpaper') === wallpaper.id));
  });
  return wallpaper;
}

function renderPicker() {
  const host = document.getElementById('wallpaperOptions');
  if (!host) return;
  host.innerHTML = WALLPAPERS.map(w => `
    <button type="button" class="wallpaper-option" data-wallpaper="${w.id}" aria-pressed="false" title="${w.label}">
      <span class="wallpaper-thumb" style="${w.file ? `background-image:url('${w.file}')` : ''}"></span>
      <span class="wallpaper-label">${w.label}</span>
    </button>`).join('');
  host.querySelectorAll('.wallpaper-option').forEach(btn => {
    btn.addEventListener('click', () => {
      applyWallpaper(btn.getAttribute('data-wallpaper'));
      window.SoundFX?.tap?.();
    });
  });
}

export function toggleWallpaperMenu(force) {
  const menu = document.getElementById('wallpaperMenu');
  const trigger = document.getElementById('wallpaperBtn');
  if (!menu) return;
  const open = typeof force === 'boolean' ? force : !menu.classList.contains('open');
  menu.classList.toggle('open', open);
  trigger?.setAttribute('aria-expanded', String(open));
}
window.toggleWallpaperMenu = toggleWallpaperMenu;

// Close the menu on outside click / Escape
document.addEventListener('click', event => {
  const menu = document.getElementById('wallpaperMenu');
  if (!menu?.classList.contains('open')) return;
  if (event.target.closest('#wallpaperMenu, #wallpaperBtn')) return;
  toggleWallpaperMenu(false);
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') toggleWallpaperMenu(false); });

// Apply immediately on import so the first paint already has the wallpaper
applyWallpaper(readChoice(), { persist: false });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { renderPicker(); applyWallpaper(readChoice(), { persist: false }); });
else { renderPicker(); applyWallpaper(readChoice(), { persist: false }); }
