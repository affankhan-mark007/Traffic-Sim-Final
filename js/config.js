/**
 * config.js
 * Central place to tune the simulation without touching logic files.
 * Times are expressed in minutes-since-midnight (0-1439) to keep
 * comparisons cheap and timezone-free.
 */

const CONFIG = {
  // Map defaults, centered on Nagpur (centroid of the 19 hotspots in
  // markers.js — recompute this if you add/remove hotspots).
  map: {
    center: [21.1354, 79.0627],
    zoom: 12,
    tileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    tileAttribution: "&copy; OpenStreetMap contributors",
  },

  // Peak-hour windows, each with its own congestion shape:
  //   startMin    -> window opens (status pill switches to PEAK here)
  //   rampUpStart -> congestion starts climbing from baseline
  //   peakMin     -> congestion hits its maximum
  //   endMin      -> window closes (congestion should be back near baseline)
  peakWindows: [
    {
      label: "Morning peak",
      startMin: 9 * 60,       // 09:00 — window opens, congestion still baseline
      rampUpStart: 10 * 60,   // 10:00 — congestion starts rising
      peakMin: 12 * 60,       // 12:00 — congestion peaks
      endMin: 13 * 60,        // 13:00 — slow decline finishes, back to baseline
    },
    {
      label: "Evening peak",
      startMin: 16 * 60,      // 16:00 — window opens, congestion still baseline
      rampUpStart: 17 * 60,   // 17:00 — congestion starts rising
      peakMin: 19 * 60,       // 19:00 — congestion peaks
      endMin: 20 * 60,        // 20:00 — decline finishes, back to baseline
    },
  ],

  // Congestion load -> marker color. Load is a 0-100 score per intersection.
  congestion: {
    thresholds: {
      moderate: 35, // load >= this is "moderate"
      heavy: 60,    // load >= this is "heavy"
      severe: 80,   // load >= this is "severe"
    },
    colorStops: {
      free: "#22c55e",     // green
      moderate: "#eab308", // amber
      heavy: "#f97316",    // orange
      severe: "#ef4444",   // red
    },
  },

  // Dynamic rerouting: shifts excess load from overloaded intersections
  // to nearby ones that still have spare capacity.
  //
  // Tuned so reroutes show up for most of each peak window rather than
  // only a minute or two right at the exact peak — verified by
  // simulating every minute of both peak windows: with these values,
  // ~63% of the ramp-up/decline period shows 2-27 active reroute pairs
  // (vs. ~12% of the time and only 1-2 pairs with overloadThreshold 75 /
  // spareCapacityThreshold 55). Off-peak stays untouched either way —
  // baseline load never gets near overloadThreshold, so the calm vs.
  // rush-hour contrast is preserved.
  rerouting: {
    overloadThreshold: 35,       // load above this triggers a reroute search
    spareCapacityThreshold: 70,  // neighbors below this are treated as having room
    maxNeighborDistanceKm: 8,    // only reroute within this radius
    redistributionFraction: 0.5, // fraction of excess moved per tick
    maxRecipients: 3,            // spread excess across at most N neighbors
  },

  // Simulation clock settings.
  clock: {
    startMin: 6 * 60,       // sim starts at 06:00
    tickRealMs: 1000,       // wall-clock ms between ticks
    defaultSpeedMultiplier: 60, // 1 real second = 60 simulated seconds by default
  },

  // Live traffic overlay: optionally replaces the synthetic per-hotspot
  // congestion model with real-world data from TomTom's Traffic Flow API.
  // Off by default so the deck/demo never depends on network access or
  // a valid key.
  liveTraffic: {
    enabled: false,
    provider: "tomtom",
    apiKey: ", // get one free at developer.tomtom.com — don't ship a real key client-side in production, proxy it server-side instead
    pollIntervalMs: 10 * 60 * 1000, // 10 min — keeps 19 hotspots well under TomTom's free 2,500 req/day tier
  },
};
