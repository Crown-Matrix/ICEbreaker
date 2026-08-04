/**
 * gameCover.js — ICEBreaker main cover page frontend
 * Handles: matrix rain, ring tick marks, nav routing, account button logic
 */

// ── Reveal body once fonts/styles are ready ───────────────────────────────────
document.body.style.visibility = 'visible';

// ── Custom cursor (computer only — matches singlePlayer/multiPlayer) ──────────
(function initCursor() {
  function attachImageCursor(imgSrc, size = 32) {
    const cursor = document.createElement('img');
    cursor.src = imgSrc;
    cursor.id = 'image-cursor';
    cursor.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 99999;
      transform: translate(-50%, -50%);
      display: none;
      width: ${size}px;
      height: ${size}px;
    `;
    document.body.appendChild(cursor);

    document.addEventListener('mousemove', (e) => {
      cursor.style.display = 'block';
      cursor.style.left = `${e.clientX}px`;
      cursor.style.top = `${e.clientY}px`;
    });

    return cursor;
  }

  function removeImageCursor() {
    document.getElementById('image-cursor')?.remove();
  }

  document.body.style.cssText += 'cursor: none !important;';

  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const style = document.createElement('style');
    style.textContent = '* { cursor: none !important; }';
    document.head.appendChild(style);
    attachImageCursor('/imgs/blueSquare.png', 32);
  }

  if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) {
    document.body.style.cursor = 'default';
    removeImageCursor();
  }
})();

// ── Matrix rain ───────────────────────────────────────────────────────────────
(function initMatrixRain() {
  const canvas = document.getElementById('matrix-rain');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Use the game's own node symbols
  const SYMBOLS = ['7A', '1C', 'BD', '55', 'E9', 'FF'];
  const FONT_SIZE = 13;    // px per character row
  const COL_WIDTH = 26;    // px per column  (fits a 2-char hex token + gap)
  const FRAME_MS  = 55;    // ~18 fps — light on CPU, still fluid

  let cols  = 0;
  let drops = [];   // current head y (in rows) for each column
  let lastTs = 0;

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    const newCols = Math.floor(canvas.width / COL_WIDTH);
    if (newCols !== cols) {
      cols  = newCols;
      drops = Array.from({ length: cols }, () => -Math.floor(Math.random() * 40));
    }
  }

  resize();
  window.addEventListener('resize', resize);

  function draw(ts) {
    requestAnimationFrame(draw);
    if (ts - lastTs < FRAME_MS) return;
    lastTs = ts;

    // Fade previous frame — controls trail length
    ctx.fillStyle = 'rgba(10, 10, 18, 0.12)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = `${FONT_SIZE}px 'Share Tech Mono', monospace`;

    for (let i = 0; i < cols; i++) {
      const y = drops[i];
      if (y < 0) { drops[i]++; continue; } // still above viewport

      const sym = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
      const px  = i * COL_WIDTH;
      const py  = y * FONT_SIZE;

      // Head character — bright cyan
      ctx.fillStyle = 'rgba(0, 255, 255, 0.92)';
      ctx.fillText(sym, px, py);

      drops[i]++;

      // Reset column once it clears the bottom
      if (py > canvas.height && Math.random() > 0.972) {
        drops[i] = -Math.floor(Math.random() * 30);
      }
    }
  }

  requestAnimationFrame(draw);
})();

// ── Ring tick marks (generated for precision) ─────────────────────────────────
(function buildRingTicks() {
  const container = document.getElementById('ring-ticks');
  if (!container) return;
  const TICK_COUNT = 36; // one every 10°
  for (let i = 0; i < TICK_COUNT; i++) {
    const tick = document.createElement('div');
    tick.className = 'ring-tick';
    tick.style.transform = `rotate(${i * (360 / TICK_COUNT)}deg)`;
    container.appendChild(tick);
  }
})();

// ── Navigation ────────────────────────────────────────────────────────────────
(function bindNav() {
  // Generic buttons with data-href
  document.querySelectorAll('.nav-item[data-href]').forEach(btn => {
    btn.addEventListener('click', () => {
      const href = btn.dataset.href;
      if (href) window.location.href = href;
    });
  });

  // Account button — check for sessionToken cookie client-side
  // If present → profile page; if absent → log-in page (avoids extra server redirect)
  const accountBtn = document.getElementById('btn-account');
  if (accountBtn) {
    accountBtn.addEventListener('click', () => {
      const hasToken = document.cookie
        .split(';')
        .some(c => c.trim().startsWith('sessionToken='));
      window.location.href = hasToken ? '/profile' : '/log-in';
    });
  }

  // Settings button — opens the popup instead of navigating
  const settingsBtn = document.getElementById('btn-settings');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      document.getElementById('settings-div').style.removeProperty('display');
    });
  }
})();

// ── Settings popup ────────────────────────────────────────────────────────────
// localStorage-only persistence (no socket on this page).
// Values are written to the same 'settings' key that singlePlayer/multiPlayer read,
// so changes here carry over into the game.
(function initSettings() {
  const default_settings = {
    FXVolume: 1,
    BGVolume: 0.6,
    muted: false,
    graphics: 'normal'
  };

  // In-memory mirror of the current settings (loaded below)
  const current = { ...default_settings };

  // ── Load from localStorage ──────────────────────────────────────────────
  (function loadSaved() {
    try {
      const saved = JSON.parse(localStorage.getItem('settings')) ?? {};
      for (const key in default_settings) {
        if (key in saved) current[key] = saved[key];
      }
    } catch {
      // corrupt localStorage — silently use defaults
    }
  })();

  // ── Persist current state to localStorage ──────────────────────────────
  function persist() {
    try {
      localStorage.setItem('settings', JSON.stringify({ ...current }));
    } catch (err) {
      console.warn('Could not save settings to localStorage:', err);
    }
  }

  // ── Apply a single setting (DOM + memory + optionally persist) ──────────
  function applySetting(key, value, save = true) {
    if (typeof default_settings[key] === 'number') {
      value = parseFloat(Math.max(0, Math.min(1, value)).toFixed(2));
    }
    current[key] = value;

    if (key === 'FXVolume') {
      document.documentElement.style.setProperty('--fx-volume', `"${Math.round(value * 100)}%"`);
      document.getElementById('fx-volume-slider').value = value;
    } else if (key === 'BGVolume') {
      document.documentElement.style.setProperty('--bg-volume', `"${Math.round(value * 100)}%"`);
      document.getElementById('bg-volume-slider').value = value;
    } else if (key === 'muted') {
      syncMuteIcon();
    } else if (key === 'graphics') {
      document.getElementById('graphics-value').textContent =
        value.charAt(0).toUpperCase() + value.slice(1);
    }

    if (save) persist();
  }

  // ── Apply all settings to DOM (used on open) ────────────────────────────
  function applyAll(save = false) {
    for (const key in default_settings) {
      applySetting(key, current[key], save);
    }
  }

  // ── Mute icon sync ──────────────────────────────────────────────────────
  function syncMuteIcon() {
    const icon = document.getElementById('mute-icon');
    if (!icon) return;
    icon.innerHTML = current.muted
      ? '<i class="bi bi-volume-mute cy-text-magenta"></i>'
      : '<i class="bi bi-volume-up cy-text-magenta"></i>';
  }

  // ── Apply saved values to DOM immediately ───────────────────────────────
  applyAll();

  // ── Wire controls ───────────────────────────────────────────────────────
  const fxSlider = document.getElementById('fx-volume-slider');
  fxSlider.addEventListener('input',  e => applySetting('FXVolume', parseFloat(e.target.value), false));
  fxSlider.addEventListener('change', e => applySetting('FXVolume', parseFloat(e.target.value)));

  const bgSlider = document.getElementById('bg-volume-slider');
  bgSlider.addEventListener('input',  e => applySetting('BGVolume', parseFloat(e.target.value), false));
  bgSlider.addEventListener('change', e => applySetting('BGVolume', parseFloat(e.target.value)));

  document.getElementById('mute-button').addEventListener('click', () => {
    applySetting('muted', !current.muted);
  });

  document.getElementById('defaults-button').addEventListener('click', () => {
    for (const key in default_settings) applySetting(key, default_settings[key]);
    syncMuteIcon();
  });

  const graphicsOptions = ['low', 'normal'];
  document.getElementById('graphics-button').addEventListener('click', () => {
    const next = graphicsOptions[(graphicsOptions.indexOf(current.graphics) + 1) % graphicsOptions.length];
    applySetting('graphics', next);
  });

  document.getElementById('close-settings-button').addEventListener('click', () => {
    document.getElementById('settings-div').style.display = 'none';
  });
})();
