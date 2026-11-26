import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

// Exercise the actual effect with deterministic media events and frame timing.
const source = readFileSync(new URL('../src/RecordingPlayer.jsx', import.meta.url), 'utf8');
const section = source.slice(source.indexOf('// Enforce passage playback'));
const body = section.slice(section.indexOf('useEffect(() => {') + 17, section.indexOf('\n  }, ['));
function player(loopEnabled = false) {
  const listeners = new Map();
  const frames = new Map();
  let nextFrame = 0;
  const audio = {
    currentTime: 8, paused: true, ended: false, seeking: false,
    addEventListener(name, fn) { listeners.set(name, fn); },
    removeEventListener(name) { listeners.delete(name); },
    pause() { this.paused = true; listeners.get('pause')?.(); },
    play() { this.paused = false; listeners.get('play')?.(); return Promise.resolve(); },
  };
  const cleared = { current: false };
  const cleanup = new Function('audioRef', 'validRange', 'loopEnabled', 'startSeconds', 'endSeconds', 'rangeClearedRef', 'setCurrentTime', 'setLoopEnabled', 'setPlayError', 'requestAnimationFrame', 'cancelAnimationFrame', body)(
    { current: audio }, true, loopEnabled, 5, 10, cleared, () => {}, () => {}, () => {},
    fn => { frames.set(++nextFrame, fn); return nextFrame; }, id => frames.delete(id));
  return { audio, cleared, cleanup, frames, listeners, update: () => listeners.get('timeupdate')?.() };
}
test('resume inside, restart outside or at end, stop at end', () => {
  const p = player();
  p.audio.play(); assert.equal(p.audio.currentTime, 8);
  p.audio.pause(); p.audio.currentTime = 2; p.audio.play();
  assert.equal(p.audio.currentTime, 5);
  p.audio.currentTime = 10.1; p.update();
  assert.equal(p.audio.currentTime, 10); assert.equal(p.audio.paused, true);
  p.audio.play(); assert.equal(p.audio.currentTime, 5);
  p.cleanup(); assert.equal(p.frames.size, 0); assert.equal(p.listeners.size, 0);
});
test('loop boundary and clearing selection', () => {
  const p = player(true); p.audio.play(); p.audio.currentTime = 10; p.update();
  assert.equal(p.audio.currentTime, 5); assert.equal(p.audio.paused, false);
  p.cleared.current = true; p.audio.currentTime = 12; p.update();
  assert.equal(p.audio.currentTime, 12); assert.equal(p.audio.paused, false);
  p.cleanup();
});
test('independent player boundaries do not change paused player', () => {
  const a = player(true); const b = player();
  a.audio.play(); a.audio.pause(); b.audio.play();
  assert.equal(a.audio.paused, true); assert.equal(b.audio.paused, false);
  assert.equal(a.frames.size, 0);
  a.cleanup(); b.cleanup();
});
