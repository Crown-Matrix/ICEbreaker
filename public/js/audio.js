const ctx = new AudioContext();
const buffers = {};

// ─── Master Gain ──────────────────────────────────────────────────────────────
const masterGain = ctx.createGain();
masterGain.connect(ctx.destination);

let audioUnlocked = false;

function unlockAudio() {
  ctx.resume();
  audioUnlocked = true;
  console.log('Audio unlocked');

  document.removeEventListener('click', unlockAudio);
  document.removeEventListener('keydown', unlockAudio);
}

document.addEventListener('click', unlockAudio);
document.addEventListener('keydown', unlockAudio);

// ─── BG Music State ───────────────────────────────────────────────────────────
let bgMusicBuffer = null;
let bgSrc         = null;
let bgGain        = null; // volume node — setBGVolume writes here
let bgFadeGain    = null; // 0..1 loop-crossfade envelope — owned by scheduleFade
let bgFadeTimeout = null;
let bgStartTime   = null;

// ─── Cover Music State ────────────────────────────────────────────────────────
let coverMusicBuffer = null;
let coverSrc         = null;
let coverGain        = null;

// ─── Hover State ──────────────────────────────────────────────────────────────
let hoverSrc = null;

// ─── Mute State ───────────────────────────────────────────────────────────────
let muted = false;
const muteFadeTime = 0.15; // seconds — quick, click-free fade

// ─── Volume State ─────────────────────────────────────────────────────────────
// bgVolume/fxVolume are the current target levels, tracked at module scope so a
// volume set before music has started (or before a sound is loaded) still
// applies once it does. fxGain is a shared bus every SFX routes through, so one
// change moves everything already playing instead of needing to touch each
// individual source.
let bgVolume = 0.5;
let fxVolume = 1;
const volumeFadeTime = 0.05; // seconds — short ramp avoids zipper noise on change
const clamp01 = (v) => Math.min(1, Math.max(0, v));

const fxGain = ctx.createGain();
fxGain.connect(masterGain);
fxGain.gain.value = fxVolume;


// ─── BG Music ─────────────────────────────────────────────────────────────────
// Volume lives on `gain`; the looping crossfade lives on `fadeGain`, which only
// ever animates between 0 and 1. Final output is their product, so setBgVolume
// can move `gain` at any time without touching or resetting fadeGain's
// schedule — and bgSrc itself is never stopped, so playback position is never
// disturbed.

function startBgMusic(bg_volume = bgVolume) {
  if (bgSrc) stopBgMusic();

  bgVolume = clamp01(bg_volume);

  const src      = ctx.createBufferSource();
  const gain     = ctx.createGain();
  const fadeGain = ctx.createGain();
  const duration = bgMusicBuffer.duration;
  const fadeTime = 1.5;

  src.buffer = bgMusicBuffer;
  src.loop   = true;
  src.connect(gain);
  gain.connect(fadeGain);
  fadeGain.connect(masterGain);

  gain.gain.setValueAtTime(bgVolume, ctx.currentTime);

  fadeGain.gain.setValueAtTime(0, ctx.currentTime);
  fadeGain.gain.linearRampToValueAtTime(1, ctx.currentTime + fadeTime);

  src.start();
  bgSrc       = src;
  bgGain      = gain;
  bgFadeGain  = fadeGain;
  bgStartTime = ctx.currentTime;

  function scheduleFade() {
    const elapsed          = ctx.currentTime - bgStartTime;
    const timeUntilLoopEnd = duration - (elapsed % duration);

    const fadeOutStart = ctx.currentTime + timeUntilLoopEnd - fadeTime;
    const fadeOutEnd   = ctx.currentTime + timeUntilLoopEnd;
    const fadeInEnd    = ctx.currentTime + timeUntilLoopEnd + fadeTime;

    fadeGain.gain.cancelScheduledValues(fadeOutStart);
    fadeGain.gain.setValueAtTime(1, fadeOutStart);
    fadeGain.gain.linearRampToValueAtTime(0, fadeOutEnd);
    fadeGain.gain.linearRampToValueAtTime(1, fadeInEnd);

    bgFadeTimeout = setTimeout(scheduleFade, (timeUntilLoopEnd + fadeTime) * 1000);
  }

  scheduleFade();
}

function stopBgMusic() {
  if (bgSrc) {
    bgSrc.stop();
    bgSrc       = null;
    bgGain      = null;
    bgFadeGain  = null;
    bgStartTime = null;
  }
  if (bgFadeTimeout) {
    clearTimeout(bgFadeTimeout);
    bgFadeTimeout = null;
  }
}

function setBgVolume(volume) {
  bgVolume = clamp01(volume);
  if (!bgGain && !coverGain) return; // nothing playing — bgVolume is picked up on next start

  const now = ctx.currentTime;
  if (bgGain) {
    bgGain.gain.cancelScheduledValues(now);
    bgGain.gain.setValueAtTime(bgGain.gain.value, now); // hold current value, avoid a jump
    bgGain.gain.linearRampToValueAtTime(bgVolume, now + volumeFadeTime);
  }

  if (coverGain) {
    coverGain.gain.cancelScheduledValues(now);
    coverGain.gain.setValueAtTime(coverGain.gain.value, now); // hold current value, avoid a jump
    coverGain.gain.linearRampToValueAtTime(bgVolume, now + volumeFadeTime);
  }
}


// ─── Cover Music ──────────────────────────────────────────────────────────────

function startCoverMusic(volume = bgVolume) {
  if (coverSrc) stopCoverMusic();

  bgVolume = clamp01(volume);

  const src  = ctx.createBufferSource();
  const gain = ctx.createGain();

  src.buffer = coverMusicBuffer;
  src.loop   = true;
  src.connect(gain);
  gain.connect(masterGain);

  gain.gain.setValueAtTime(bgVolume, ctx.currentTime);

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
  gain.connect(fxGain);
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

function setFxVolume(volume) {
  fxVolume = clamp01(volume);

  const now = ctx.currentTime;
  fxGain.gain.cancelScheduledValues(now);
  fxGain.gain.setValueAtTime(fxGain.gain.value, now); // hold current value, avoid a jump
  fxGain.gain.linearRampToValueAtTime(fxVolume, now + volumeFadeTime);
}


// ─── Mute ─────────────────────────────────────────────────────────────────────
// Fades the master bus instead of touching bgGain/coverGain, so the loop-fade
// schedule in scheduleFade() is left alone and nothing has to stop or restart.

function setMuted(value) {
  if (value === muted) return;
  muted = value;

  const now = ctx.currentTime;
  masterGain.gain.cancelScheduledValues(now);
  masterGain.gain.setValueAtTime(masterGain.gain.value, now); // hold current value, avoid a jump
  masterGain.gain.linearRampToValueAtTime(value ? 0 : 1, now + muteFadeTime);
}

function toggleMuted() {
  setMuted(!muted);
  return muted;
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
export const setBGVolume     = (volume) => setBgVolume(volume);
export const setFXVolume     = (volume) => setFxVolume(volume);
export const getBGVolume     = ()       => bgVolume;
export const getFXVolume     = ()       => fxVolume;
export const muteAudio       = ()       => setMuted(true);
export const unmuteAudio     = ()       => setMuted(false);
export const toggleMute      = ()       => toggleMuted();
export const isAudioMuted    = ()       => muted;