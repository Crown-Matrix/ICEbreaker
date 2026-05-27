const ctx = new AudioContext();
const buffers = {};

let audioUnlocked = false;

document.addEventListener('click', () => {
  ctx.resume();
  audioUnlocked = true;
  console.log('Audio unlocked');
}, { once: true });

// ─── BG Music State ───────────────────────────────────────────────────────────
let bgMusicBuffer = null;
let bgSrc         = null;
let bgGain        = null;
let bgFadeTimeout = null;
let bgStartTime   = null;

// ─── Cover Music State ────────────────────────────────────────────────────────
let coverMusicBuffer = null;
let coverSrc         = null;
let coverGain        = null;

// ─── Hover State ──────────────────────────────────────────────────────────────
let hoverSrc = null;


// ─── BG Music ─────────────────────────────────────────────────────────────────

function startBgMusic(bg_volume = 0.5) {
  if (bgSrc) stopBgMusic();

  const src      = ctx.createBufferSource();
  const gain     = ctx.createGain();
  const duration = bgMusicBuffer.duration;
  const fadeTime = 1.5;

  src.buffer = bgMusicBuffer;
  src.loop   = true;
  src.connect(gain);
  gain.connect(ctx.destination);

  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(bg_volume, ctx.currentTime + fadeTime);

  src.start();
  bgSrc       = src;
  bgGain      = gain;
  bgStartTime = ctx.currentTime;

  function scheduleFade() {
    const elapsed          = ctx.currentTime - bgStartTime;
    const timeUntilLoopEnd = duration - (elapsed % duration);

    const fadeOutStart = ctx.currentTime + timeUntilLoopEnd - fadeTime;
    const fadeOutEnd   = ctx.currentTime + timeUntilLoopEnd;
    const fadeInEnd    = ctx.currentTime + timeUntilLoopEnd + fadeTime;

    gain.gain.cancelScheduledValues(fadeOutStart);
    gain.gain.setValueAtTime(bg_volume, fadeOutStart);
    gain.gain.linearRampToValueAtTime(0, fadeOutEnd);
    gain.gain.linearRampToValueAtTime(bg_volume, fadeInEnd);

    bgFadeTimeout = setTimeout(scheduleFade, (timeUntilLoopEnd + fadeTime) * 1000);
  }

  scheduleFade();
}

function stopBgMusic() {
  if (bgSrc) {
    bgSrc.stop();
    bgSrc       = null;
    bgGain      = null;
    bgStartTime = null;
  }
  if (bgFadeTimeout) {
    clearTimeout(bgFadeTimeout);
    bgFadeTimeout = null;
  }
}


// ─── Cover Music ──────────────────────────────────────────────────────────────

function startCoverMusic(volume = 0.5) {
  if (coverSrc) stopCoverMusic();

  const src  = ctx.createBufferSource();
  const gain = ctx.createGain();

  src.buffer = coverMusicBuffer;
  src.loop   = true;
  src.connect(gain);
  gain.connect(ctx.destination);

  gain.gain.setValueAtTime(volume, ctx.currentTime);

  src.start();
  coverSrc  = src;
  coverGain = gain;
}

function stopCoverMusic() {
  if (coverSrc) {
    coverSrc.stop();
    coverSrc  = null;
    coverGain = null;
  }
}


// ─── SFX ──────────────────────────────────────────────────────────────────────

async function loadSound(name, url) {
  const res     = await fetch(url);
  buffers[name] = await ctx.decodeAudioData(await res.arrayBuffer());
}

export function playSound(name, volume = 1, onEndedCallback = null) {
  if (!audioUnlocked) return;

  if (name === 'hover') {
    if (hoverSrc) {
      hoverSrc.stop();
      hoverSrc = null;
    }
  }

  const gain = ctx.createGain();
  const src  = ctx.createBufferSource();

  gain.gain.value = volume;
  src.buffer      = buffers[name];
  src.connect(gain);
  gain.connect(ctx.destination);
  src.start();

  if (name === 'hover') {
    hoverSrc = src;
    src.onended = () => {
      hoverSrc = null;
      if (onEndedCallback) onEndedCallback();
    };
  } else if (onEndedCallback) {
    src.onended = onEndedCallback;
  }
}


// ─── Init ─────────────────────────────────────────────────────────────────────

export async function initAudio() {
  try {
    const [bgBuffer, coverBuffer] = await Promise.all([
      fetch('/audios/main/bgMusicStart.mp3').then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)),
      fetch('/audios/main/coverMusic.mp3').then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)),
      loadSound('click', '/audios/main/cellClick.mp3'),
      loadSound('win',   '/audios/main/win.mp3'),
      loadSound('lose',  '/audios/main/lose.mp3'),
      loadSound('hover', '/audios/main/cellHover.mp3'),
      loadSound('close', '/audios/main/closeRound.mp3'),
    ]);

    bgMusicBuffer    = bgBuffer;
    coverMusicBuffer = coverBuffer;
  } catch (error) {
    console.error('Error loading audio files:', error);
  }
}


// ─── Exports ──────────────────────────────────────────────────────────────────

export const startMusic      = (volume) => startBgMusic(volume);
export const stopMusic       = ()       => stopBgMusic();
export const startCover      = (volume) => startCoverMusic(volume);
export const stopCover       = ()       => stopCoverMusic();