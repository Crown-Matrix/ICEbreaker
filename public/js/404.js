//404.js

// reveal body once fonts/styles are ready
document.body.style.visibility = 'visible';

// Custom cursor (computer only — matches gameCover/singlePlayer/multiPlayer)
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

  // Default first — covers hybrid devices (touchscreen laptops, styluses)
  // that match neither media query below.
  document.body.style.cursor = 'default';

  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.body.style.cssText += 'cursor: none !important;';
    const style = document.createElement('style');
    style.textContent = '* { cursor: none !important; }';
    document.head.appendChild(style);
    attachImageCursor('/imgs/blueSquare.png', 32);
  }
})();

// Custom "404" glitch effect. Idle: irregular JS-timed bursts (random
// delay, 50/50 double-stutter chance). Hovered: continuous bursts every
// 0.15s with a guaranteed double-stutter, until the mouse leaves, then
// back to idle. Each burst slices two duplicate text layers (::before /
// ::after, styled in 404.css) into random horizontal bands and offsets
// them briefly.
//
// Separately, each burst has a *chance* of also triggering a page-wide
// "signal drop" flash (body.signal-drop): 0% for the 3 bursts right
// after a flash, then a roll per burst until one lands, which resets
// the cooldown — 10% for natural/idle-timer bursts, 4% for bursts
// fired during the continuous hover glitch. Most bursts are just the
// plain glyph glitch.
(function initCodeGlitch() {
  const el = document.querySelector('.code-glitch');
  if (!el) return;

  let hovering = false;
  let scheduleTimer = null;

  const FLASH_COOLDOWN = 3;
  const FLASH_CHANCE_IDLE = 0.10;
  const FLASH_CHANCE_HOVER = 0.04;
  let burstsSinceFlash = FLASH_COOLDOWN; // eligible for a flash from the first burst

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function burst() {
    const bandA = rand(0, 40);
    const bandB = bandA + rand(15, 35);
    const bandC = rand(45, 70);
    const bandD = bandC + rand(15, 30);

    el.style.setProperty('--gc-clip-a', `${bandA}%`);
    el.style.setProperty('--gc-clip-b', `${bandB}%`);
    el.style.setProperty('--gc-clip-c', `${bandC}%`);
    el.style.setProperty('--gc-clip-d', `${bandD}%`);
    el.style.setProperty('--gc-x1', `${rand(-8, 8)}px`);
    el.style.setProperty('--gc-x2', `${rand(-8, 8)}px`);

    el.classList.add('is-glitching');

    let doFlash = false;
    if (burstsSinceFlash >= FLASH_COOLDOWN) {
      const flashChance = hovering ? FLASH_CHANCE_HOVER : FLASH_CHANCE_IDLE;
      doFlash = Math.random() < flashChance;
    }
    if (doFlash) {
      document.body.classList.add('signal-drop');
      burstsSinceFlash = 0;
    } else {
      burstsSinceFlash++;
    }

    const glitchDuration = rand(70, 180);
    setTimeout(() => {
      el.classList.remove('is-glitching');
      if (doFlash) document.body.classList.remove('signal-drop');
    }, glitchDuration);
  }

  function scheduleNext() {
    const delay = hovering ? 150 : rand(1800, 4200);
    scheduleTimer = setTimeout(() => {
      burst();
      const stutterChance = hovering ? 1 : 0.5;
      if (Math.random() < stutterChance) {
        setTimeout(burst, rand(80, 160));
      }
      scheduleNext();
    }, delay);
  }

  el.addEventListener('mouseenter', () => {
    hovering = true;
    clearTimeout(scheduleTimer);
    scheduleNext();
  });

  el.addEventListener('mouseleave', () => {
    hovering = false;
    clearTimeout(scheduleTimer);
    scheduleNext();
  });

  scheduleNext();
})();

// Typewriter diagnostic log
(function initDiagLog() {
  const log = document.getElementById('diagLog');
  if (!log) return;

  const lines = [
    { text: 'tracing route...', className: 'terminal-line--muted' },
    { text: `requested path: ${window.location.pathname}${window.location.search}`, className: '' },
    { text: 'status: 404 NOT_FOUND', className: 'terminal-line--status' },
    { text: 'suggestion: return to known coordinates', className: 'terminal-line--muted' },
  ];

  let lineIndex = 0;

  function typeLine() {
    if (lineIndex >= lines.length) return;

    const { text, className } = lines[lineIndex];
    const lineEl = document.createElement('div');
    lineEl.className = `terminal-line ${className}`.trim();

    const textNode = document.createElement('span');
    const caret = document.createElement('span');
    caret.className = 'caret';

    lineEl.appendChild(textNode);
    lineEl.appendChild(caret);
    log.appendChild(lineEl);

    let charIndex = 0;
    const typeInterval = setInterval(() => {
      charIndex++;
      textNode.textContent = text.slice(0, charIndex);
      if (charIndex >= text.length) {
        clearInterval(typeInterval);
        caret.remove();
        lineIndex++;
        setTimeout(typeLine, 220);
      }
    }, 18);
  }

  typeLine();
})();

// Back navigation
(function initBackButton() {
  const btn = document.getElementById('goBackBtn');
  if (!btn) return;

  const noHistory = window.history.length <= 1;

  let backGoesToRoot = false;
  if (document.referrer) {
    try {
      const refUrl = new URL(document.referrer);
      backGoesToRoot = refUrl.origin === window.location.origin && refUrl.pathname === '/';
    } catch (e) {
      backGoesToRoot = false;
    }
  }

  if (noHistory || backGoesToRoot) {
    btn.style.display = 'none';
    return;
  }

  btn.addEventListener('click', () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = '/';
    }
  });
})();