/**
 * main.js
 * Wires up the map, the simulation clock, the congestion model, and
 * (optionally) dynamic rerouting. Keep this file thin — it should
 * mostly connect the pieces defined in the other js/ files.
 */

document.addEventListener("DOMContentLoaded", () => {
  // ---- Map setup ----
  const map = L.map("map").setView(CONFIG.map.center, CONFIG.map.zoom);

  L.tileLayer(CONFIG.map.tileUrl, {
    attribution: CONFIG.map.tileAttribution,
    maxZoom: 19,
  }).addTo(map);

  const markerLookup = createMarkers(map);
  const rerouteLayer = L.layerGroup().addTo(map); // dashed lines for active reroutes

  // ---- Clock setup ----
  const clock = new SimulationClock({
    startMin: CONFIG.clock.startMin,
    tickRealMs: CONFIG.clock.tickRealMs,
    speedMultiplier: CONFIG.clock.defaultSpeedMultiplier,
    peakWindows: CONFIG.peakWindows,
  });

  // ---- UI elements ----
  const clockTimeEl = document.getElementById("clock-time");
  const clockStatusEl = document.getElementById("clock-status");
  const playBtn = document.getElementById("btn-play");
  const resetBtn = document.getElementById("btn-reset");
  const speedSlider = document.getElementById("speed-slider");
  const speedValueEl = document.getElementById("speed-value");
  const peakListEl = document.getElementById("peak-windows-list");
  const reroutingToggle = document.getElementById("toggle-rerouting");
  const liveTrafficToggle = document.getElementById("toggle-live-traffic");
  const liveStatusEl = document.getElementById("stat-live-status");
  const avgLoadEl = document.getElementById("stat-avg-load");
  const rerouteCountEl = document.getElementById("stat-reroute-count");
  const loadShiftedEl = document.getElementById("stat-load-shifted");
  const rerouteListEl = document.getElementById("reroute-details-list");

  // Populate the peak-window list once from config.
  CONFIG.peakWindows.forEach((w) => {
    const li = document.createElement("li");
    const fmt = (m) =>
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    li.innerHTML = `<span>${w.label}</span><span>${fmt(w.startMin)}–${fmt(w.endMin)}</span>`;
    peakListEl.appendChild(li);
  });

  /** Rounds for display, but avoids a misleading "0%" for genuinely tiny amounts. */
  function formatPct(value) {
    if (value > 0 && value < 1) return "<1%";
    return `${Math.round(value)}%`;
  }

  /**
   * Draws dashed, animated lines for every active reroute (replacing the
   * previous set) and lists them in the side panel as "source → target".
   */
  function renderReroutes(pairs) {
    rerouteLayer.clearLayers();

    pairs.forEach(({ from, to, amount }) => {
      const line = L.polyline(
        [
          [from.lat, from.lng],
          [to.lat, to.lng],
        ],
        {
          color: "#38bdf8",
          weight: Math.max(1.5, amount / 15),
          dashArray: "6 6",
          opacity: 0.85,
          className: "reroute-line", // CSS animates this to show flow direction
        }
      ).addTo(rerouteLayer);

      // Small always-visible label at the line's midpoint showing the
      // % of load moving along it — readable without needing a hover.
      line.bindTooltip(formatPct(amount), {
        permanent: true,
        direction: "center",
        className: "reroute-line-label",
      });
    });

    rerouteListEl.innerHTML = "";

    if (pairs.length === 0) {
      const li = document.createElement("li");
      li.className = "reroute-empty";
      li.textContent = "No active reroutes right now.";
      rerouteListEl.appendChild(li);
      return;
    }

    [...pairs]
      .sort((a, b) => b.amount - a.amount) // biggest shifts first
      .forEach(({ from, to, amount }) => {
        const li = document.createElement("li");
        li.innerHTML = `<span>${from.name} → ${to.name}</span><span>${formatPct(amount)}</span>`;
        rerouteListEl.appendChild(li);
      });
  }

  /** Builds an id -> "source"|"target"|"both" lookup for marker highlighting. */
  function buildRerouteRoles(pairs) {
    const roles = {};
    pairs.forEach(({ from, to }) => {
      roles[from.id] = roles[from.id] === "target" ? "both" : "source";
      roles[to.id] = roles[to.id] === "source" ? "both" : "target";
    });
    return roles;
  }

  /**
   * Core tick handler: computes load per intersection, optionally runs
   * rerouting, then pushes the results out to markers, lines, and stats.
   */
  function render(snapshot) {
    // Clock display always updates first and unconditionally — even if
    // something below throws, the time keeps ticking on the next call.
    clockTimeEl.textContent = clock.getFormattedTime();

    if (snapshot.isPeak) {
      clockStatusEl.textContent = `PEAK — ${snapshot.activeWindow.label}`;
      clockStatusEl.className = "status-pill status-peak";
    } else {
      clockStatusEl.textContent = "OFF-PEAK";
      clockStatusEl.className = "status-pill status-offpeak";
    }

    // Congestion/marker/rerouting updates are isolated: a bug or a
    // one-off Leaflet hiccup in here should never be able to freeze
    // the clock display above. Check the browser console if this fires.
    try {
      const rawLoads = computeAllRawLoads(SAMPLE_INTERSECTIONS, snapshot);

      // Live feed overrides the synthetic load per-hotspot wherever a
      // fresh TomTom reading exists; hotspots without live data keep
      // their synthetic value for this tick.
      if (LiveTraffic.isEnabled()) {
        SAMPLE_INTERSECTIONS.forEach((i) => {
          const live = LiveTraffic.getLoad(i.id);
          if (live !== null) rawLoads[i.id] = live;
        });
      }

      let effectiveLoads = rawLoads;
      let reroutedPairs = [];

      if (reroutingToggle.checked) {
        const result = applyRerouting(SAMPLE_INTERSECTIONS, rawLoads, CONFIG.rerouting);
        effectiveLoads = result.effectiveLoads;
        reroutedPairs = result.reroutedPairs;
      }

      updateMarkerAppearance(
        markerLookup,
        SAMPLE_INTERSECTIONS,
        effectiveLoads,
        buildRerouteRoles(reroutedPairs)
      );
      renderReroutes(reroutedPairs);

      // ---- Stats ----
      const ids = SAMPLE_INTERSECTIONS.map((i) => i.id);
      const avgRaw = ids.reduce((sum, id) => sum + rawLoads[id], 0) / ids.length;
      const avgEffective = ids.reduce((sum, id) => sum + effectiveLoads[id], 0) / ids.length;
      const shiftedTotal = reroutedPairs.reduce((sum, p) => sum + p.amount, 0);
      const shiftedPct = avgRaw > 0 ? (shiftedTotal / (avgRaw * ids.length)) * 100 : 0;

      avgLoadEl.textContent = `${Math.round(avgEffective)}%`;
      rerouteCountEl.textContent = reroutedPairs.length;
      loadShiftedEl.textContent = `${Math.round(shiftedPct)}%`;
    } catch (err) {
      console.error("Congestion/marker update failed this tick:", err);
    }
  }

  function currentSnapshot() {
    return {
      minutesSinceMidnight: clock.minutesSinceMidnight,
      isPeak: clock.isPeakHour(),
      activeWindow: clock.getActiveWindow(),
    };
  }

  clock.onTick(render);

  // Start the timer loop first, THEN do the initial paint. This way,
  // even if something throws during the very first render, the
  // interval is already running and the next tick will recover.
  clock.start();

  try {
    render(currentSnapshot());
  } catch (err) {
    console.error("Initial render failed (clock is still running):", err);
  }

  // ---- Controls ----
  playBtn.addEventListener("click", () => {
    if (clock.isRunning) {
      clock.stop();
      playBtn.textContent = "Play";
    } else {
      clock.start();
      playBtn.textContent = "Pause";
    }
  });

  resetBtn.addEventListener("click", () => {
    clock.reset(CONFIG.clock.startMin);
    render(currentSnapshot());
  });

  speedSlider.addEventListener("input", (e) => {
    const multiplier = Number(e.target.value);
    clock.setSpeedMultiplier(multiplier);
    speedValueEl.textContent = multiplier;
  });

  // Give instant feedback when the mitigation strategy is toggled,
  // rather than waiting for the next tick.
  reroutingToggle.addEventListener("change", () => {
    render(currentSnapshot());
  });

  // ---- Live traffic feed ----
  LiveTraffic.init((status) => {
    liveStatusEl.textContent = status;
  });

  liveTrafficToggle.addEventListener("change", () => {
    if (liveTrafficToggle.checked) {
      LiveTraffic.enable(SAMPLE_INTERSECTIONS);
    } else {
      LiveTraffic.disable();
    }
    render(currentSnapshot());
  });
});
