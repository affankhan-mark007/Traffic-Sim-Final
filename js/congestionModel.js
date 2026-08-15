/**
 * congestionModel.js
 * Pure functions that turn "what time is it" into "how loaded is this
 * intersection right now". Kept separate from rendering/rerouting so
 * the model itself can be tweaked or swapped without touching either.
 */

/**
 * Computes a 0-100 congestion load for one intersection at the current
 * simulated time. Off-peak, load stays low with a gentle per-marker
 * wobble. Inside a peak window, load follows a three-phase shape:
 *   1. startMin -> rampUpStart : stays at baseline (window is "open"
 *      but rush hasn't started building yet)
 *   2. rampUpStart -> peakMin  : climbs linearly from baseline to peak
 *   3. peakMin -> endMin       : declines linearly back toward baseline
 * scaled by that intersection's own congestionFactor (how bad it gets
 * relative to other junctions).
 */
function computeRawLoad(intersection, clockSnapshot) {
  const { isPeak, activeWindow, minutesSinceMidnight } = clockSnapshot;

  // Smooth per-marker wobble so off-peak markers don't all move in lockstep.
  const wobble = (Math.sin(minutesSinceMidnight * 0.15 + intersection._seed) + 1) * 7; // 0-14
  const baseline = 16 + wobble;

  if (!isPeak) {
    return Math.min(100, baseline);
  }

  // Fall back to sensible defaults if a custom window omits the
  // ramp keyframes, so this never breaks on hand-edited configs.
  const rampUpStart = activeWindow.rampUpStart ?? activeWindow.startMin;
  const peakMin = activeWindow.peakMin ?? (activeWindow.startMin + activeWindow.endMin) / 2;
  const endMin = activeWindow.endMin;

  let proximity; // 0 (baseline) -> 1 (peak) -> 0 (baseline again)

  if (minutesSinceMidnight < rampUpStart) {
    proximity = 0; // window is open but congestion hasn't started climbing yet
  } else if (minutesSinceMidnight < peakMin) {
    proximity = (minutesSinceMidnight - rampUpStart) / (peakMin - rampUpStart);
  } else {
    proximity = 1 - (minutesSinceMidnight - peakMin) / (endMin - peakMin);
    proximity = Math.max(0, proximity);
  }

  const peakLoad = proximity * intersection.congestionFactor * 100;
  return Math.round(Math.min(100, Math.max(baseline, peakLoad)));
}

/** Computes raw loads for every intersection, keyed by id. */
function computeAllRawLoads(intersections, clockSnapshot) {
  const loads = {};
  intersections.forEach((i) => {
    loads[i.id] = computeRawLoad(i, clockSnapshot);
  });
  return loads;
}