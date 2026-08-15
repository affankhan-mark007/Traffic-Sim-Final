/**
 * markers.js
 * Sample "intersection" data plus helpers to draw them on the Leaflet
 * map and repaint them as congestion load changes.
 *
 * SAMPLE_INTERSECTIONS below are real Nagpur traffic hotspots, drawn
 * from the Nagpur Traffic Police congestion study (Geetanjali Square,
 * Automotive Square, Kadbi Chowk, etc. — nagpurtoday.in, May 2025).
 * congestionFactor (0-1) controls how bad each junction gets at the
 * peak of a peak window. The values below are this project's own
 * relative estimates (busier/narrower junctions rated higher) — not
 * official published severity numbers — so tune them if you have
 * better local data.
 */

const SAMPLE_INTERSECTIONS = [
  // ---- existing hotspots ----
  { id: "geetanjali-square", name: "Geetanjali Square", lat: 21.1520062, lng: 79.0976850, congestionFactor: 0.90 },
  { id: "automotive-square", name: "Automotive Square", lat: 21.1829886, lng: 79.1181526, congestionFactor: 0.95 },
  { id: "telephone-exchange-sq", name: "Telephone Exchange Square", lat: 21.1487634, lng: 79.1200095, congestionFactor: 0.75 },
  { id: "liberty-chowk", name: "Liberty Chowk", lat: 21.1586318, lng: 79.0795106, congestionFactor: 0.70 },
  { id: "jagnade-chowk", name: "Jagnade Chowk", lat: 21.1385930, lng: 79.1192185, congestionFactor: 0.65 },
  { id: "kadbi-chowk", name: "Kadbi Chowk", lat: 21.1679191, lng: 79.0908953, congestionFactor: 0.85 },
  { id: "variety-square", name: "Variety Square", lat: 21.1434772, lng: 79.0810993, congestionFactor: 0.80 },
  { id: "zero-mile-square", name: "Zero Mile Square", lat: 21.1498421, lng: 79.0806014, congestionFactor: 0.60 },
  { id: "ajni-square", name: "Ajni Square", lat: 21.1181740, lng: 79.0722052, congestionFactor: 0.75 },

  // ---- new hotspots: Hingna corridor, VNIT, Lokmanya Nagar + others ----
  { id: "hingna-naka", name: "Hingna Naka (T-Point)", lat: 21.0975000, lng: 78.9825000, congestionFactor: 0.75 },
  { id: "vnit-square", name: "VNIT Square", lat: 21.1243000, lng: 79.0511000, congestionFactor: 0.65 },
  { id: "lokmanya-nagar-square", name: "Lokmanya Nagar Square", lat: 21.1106800, lng: 79.0016100, congestionFactor: 0.80 },
  { id: "wanadongri-chowk", name: "Wanadongri Chowk", lat: 21.1050000, lng: 78.9700000, congestionFactor: 0.70 },
  { id: "rachana-ring-road-junction", name: "Rachana Ring Road Junction", lat: 21.1214300, lng: 79.0292200, congestionFactor: 0.72 },
  { id: "manish-nagar-square", name: "Manish Nagar Square", lat: 21.1030000, lng: 79.0280000, congestionFactor: 0.78 },
  { id: "sadar-bazaar-square", name: "Sadar Bazaar Square", lat: 21.1620000, lng: 79.0730000, congestionFactor: 0.68 },
  { id: "lic-square", name: "LIC Square", lat: 21.1450000, lng: 79.0700000, congestionFactor: 0.72 },
  { id: "pratap-nagar-square", name: "Pratap Nagar Square", lat: 21.1280000, lng: 79.0630000, congestionFactor: 0.66 },
  { id: "chhatrapati-square", name: "Chhatrapati Square", lat: 21.1150000, lng: 79.0640000, congestionFactor: 0.70 },
].map((intersection, index) => ({
  ...intersection,
  _seed: index * 1.7, // offsets each marker's off-peak wobble so they don't move in lockstep
}));

/** Maps a 0-100 load score to a marker fill color using CONFIG's thresholds. */
function getLoadColor(load) {
  const { thresholds, colorStops } = CONFIG.congestion;
  if (load < thresholds.moderate) return colorStops.free;
  if (load < thresholds.heavy) return colorStops.moderate;
  if (load < thresholds.severe) return colorStops.heavy;
  return colorStops.severe;
}

/** Maps load to a marker radius (8-14px) so severity reads even in grayscale. */
function getLoadRadius(load) {
  return 8 + (load / 100) * 6;
}

/**
 * Maps a marker's rerouting role to a border style, so you can see on
 * the map itself which junctions are shedding load ("source") vs.
 * absorbing it ("target") — separate from the fill color, which stays
 * driven by load severity.
 */
function getRerouteBorderStyle(role) {
  switch (role) {
    case "source":
      return { color: "#38bdf8", weight: 2, dashArray: "3 4" }; // dashed = shedding load
    case "target":
      return { color: "#38bdf8", weight: 3, dashArray: null }; // solid thick = absorbing load
    case "both":
      return { color: "#38bdf8", weight: 3, dashArray: "2 5" };
    default:
      return { color: "#ffffff", weight: 2, dashArray: null }; // not involved in any reroute
  }
}

/**
 * Creates a circle marker per intersection and returns a lookup map
 * of id -> Leaflet layer, so updateMarkerAppearance can restyle them
 * cheaply each tick (no re-render, just a style patch).
 */
function createMarkers(map, intersections = SAMPLE_INTERSECTIONS) {
  const markerLookup = {};

  intersections.forEach((point) => {
    const circle = L.circleMarker([point.lat, point.lng], {
      radius: 8,
      color: "#ffffff",
      weight: 2,
      fillColor: CONFIG.congestion.colorStops.free,
      fillOpacity: 0.9,
      className: "traffic-marker",
    }).addTo(map);

    circle.bindTooltip(point.name, { direction: "top", offset: [0, -6] });
    markerLookup[point.id] = circle;
  });

  return markerLookup;
}

/**
 * Repaints every marker's color, radius, border, and tooltip based on
 * its current load and (optionally) its role in this tick's active
 * reroutes. Called from the clock's onTick listener in main.js.
 *
 * @param {object} rerouteRoles - id -> "source" | "target" | "both"
 */
function updateMarkerAppearance(markerLookup, intersections, loads, rerouteRoles = {}) {
  intersections.forEach((point) => {
    const marker = markerLookup[point.id];
    const load = loads[point.id];
    const border = getRerouteBorderStyle(rerouteRoles[point.id]);

    marker.setStyle({
      fillColor: getLoadColor(load),
      radius: getLoadRadius(load),
      color: border.color,
      weight: border.weight,
      dashArray: border.dashArray,
    });

    const roleNote =
      rerouteRoles[point.id] === "source"
        ? " (shedding load)"
        : rerouteRoles[point.id] === "target" || rerouteRoles[point.id] === "both"
        ? " (absorbing load)"
        : "";
    marker.setTooltipContent(`${point.name} — ${Math.round(load)}% load${roleNote}`);
  });
}