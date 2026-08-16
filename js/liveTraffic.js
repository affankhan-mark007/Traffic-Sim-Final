/**
 * liveTraffic.js
 * Optional overlay: replaces the synthetic per-hotspot congestion with
 * real-world data from TomTom's Flow Segment Data API when the "Live
 * traffic feed" checkbox is on. Hotspots that fail to fetch (no
 * coverage at that point, rate limit, network error) simply fall back
 * to the synthetic peak-hour curve for that tick — never blocks
 * rendering.
 */
const LiveTraffic = (() => {
  let enabled = false;
  let pollTimer = null;
  const liveLoads = {}; // id -> 0-100, only present once a fetch succeeds
  let onStatusChange = () => {};

  /** TomTom currentSpeed/freeFlowSpeed -> a 0-100 "load" score, same scale as the synthetic model. */
  function segmentToLoad(segment) {
    if (!segment || !segment.currentSpeed || !segment.freeFlowSpeed) return null;
    const ratio = segment.currentSpeed / segment.freeFlowSpeed;
    return Math.round(Math.min(100, Math.max(0, (1 - ratio) * 100)));
  }

  async function fetchOne(intersection) {
    const { apiKey } = CONFIG.liveTraffic;
    const url =
      `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json` +
      `?point=${intersection.lat},${intersection.lng}&key=${apiKey}`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const load = segmentToLoad(data.flowSegmentData);
      if (load !== null) {
        liveLoads[intersection.id] = load;
      } else {
        delete liveLoads[intersection.id]; // no usable data here -> fall back this tick
      }
    } catch (err) {
      console.warn(`Live traffic: fetch failed for ${intersection.name}`, err);
      delete liveLoads[intersection.id];
    }
  }

  async function pollAll(intersections) {
    onStatusChange("Loading…");
    await Promise.all(intersections.map(fetchOne));
    if (!enabled) return; // toggled off mid-fetch
    const gotAny = Object.keys(liveLoads).length > 0;
    onStatusChange(gotAny ? "Live" : "No data (fallback)");
  }

  return {
    /**
     * Registers the status callback. Call once, before enable/disable.
     * statusCallback receives one of: "Off" | "Loading…" | "Live" | "No data (fallback)".
     */
    init(statusCallback) {
      onStatusChange = statusCallback || (() => {});
    },

    /** Starts polling immediately, then every CONFIG.liveTraffic.pollIntervalMs. */
    enable(intersections) {
      if (enabled) return;
      enabled = true;
      pollAll(intersections);
      pollTimer = setInterval(() => pollAll(intersections), CONFIG.liveTraffic.pollIntervalMs);
    },

    disable() {
      enabled = false;
      clearInterval(pollTimer);
      pollTimer = null;
      Object.keys(liveLoads).forEach((id) => delete liveLoads[id]);
      onStatusChange("Off");
    },

    isEnabled() {
      return enabled;
    },

    /** Returns the live 0-100 load for this intersection id, or null if unavailable. */
    getLoad(id) {
      return enabled && id in liveLoads ? liveLoads[id] : null;
    },
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = { LiveTraffic };
}
