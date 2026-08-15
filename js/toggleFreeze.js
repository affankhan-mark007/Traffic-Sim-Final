/**
 * toggleFreeze.js
 * Small pure helper used by the "Dynamic rerouting" checkbox so that
 * flipping it mid-run pins the underlying congestion, instead of the
 * before/after comparison silently spanning two different simulated
 * moments (since the clock keeps advancing while you look).
 *
 * If the clock is running when the toggle changes, this pauses it and
 * returns true so the caller can sync any UI that mirrors run state
 * (e.g. the Play/Pause button label). If the clock was already
 * stopped, this is a no-op and returns false.
 */
function pauseClockOnToggle(clock) {
  if (clock.isRunning) {
    clock.stop();
    return true;
  }
  return false;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { pauseClockOnToggle };
}