/**
 * rerouting.js
 * Dynamic rerouting: when an intersection's load exceeds the overload
 * threshold, push some of its excess onto nearby intersections that
 * still have spare capacity. This is a simplified stand-in for how
 * real routing algorithms (Waze/Google Maps-style) shift drivers off
 * saturated roads onto less busy alternatives.
 */

/** Haversine distance in km between two {lat,lng} points. */
function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Redistributes excess load from overloaded intersections to nearby
 * under-capacity ones.
 *
 * Algorithm (per tick):
 *  1. Find every intersection above overloadThreshold, worst first.
 *  2. For each, look for neighbors within maxNeighborDistanceKm that
 *     are below spareCapacityThreshold, nearest first.
 *  3. Move a fraction of the excess load onto up to maxRecipients of
 *     those neighbors, without pushing them past spareCapacityThreshold.
 *
 * @returns {{ effectiveLoads: object, reroutedPairs: Array }}
 *   effectiveLoads - load per id after redistribution
 *   reroutedPairs  - [{ from, to, amount, distanceKm }] for drawing on the map
 */
function applyRerouting(intersections, rawLoads, options) {
  const {
    overloadThreshold,
    spareCapacityThreshold,
    maxNeighborDistanceKm,
    redistributionFraction,
    maxRecipients,
  } = options;

  const effective = { ...rawLoads };
  const reroutedPairs = [];

  const overloaded = intersections
    .filter((i) => rawLoads[i.id] > overloadThreshold)
    .sort((a, b) => rawLoads[b.id] - rawLoads[a.id]); // worst first

  overloaded.forEach((source) => {
    const neighbors = intersections
      .filter((t) => t.id !== source.id && effective[t.id] < spareCapacityThreshold)
      .map((t) => ({ target: t, distanceKm: haversineKm(source, t) }))
      .filter((n) => n.distanceKm <= maxNeighborDistanceKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, maxRecipients);

    if (neighbors.length === 0) return; // no relief valve nearby — stays congested

    const excess = effective[source.id] - overloadThreshold;
    const share = (excess * redistributionFraction) / neighbors.length;

    neighbors.forEach(({ target, distanceKm }) => {
      const spareCapacity = spareCapacityThreshold - effective[target.id];
      const amount = Math.max(0, Math.min(share, spareCapacity));
      if (amount <= 0) return;

      effective[source.id] -= amount;
      effective[target.id] += amount;
      reroutedPairs.push({ from: source, to: target, amount, distanceKm });
    });
  });

  return { effectiveLoads: effective, reroutedPairs };
}