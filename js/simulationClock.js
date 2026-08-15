/**
 * simulationClock.js
 * Drives simulated time forward on a setInterval loop and exposes
 * peak-hour status. Decoupled from the map/markers so you can reuse
 * it for other time-driven logic (signal timing, spawn rates, etc).
 */

class SimulationClock {
  /**
   * @param {object} opts
   * @param {number} opts.startMin - simulation start time, minutes since midnight
   * @param {number} opts.tickRealMs - real-world ms between each tick
   * @param {number} opts.speedMultiplier - simulated seconds per real second
   * @param {Array<{label:string,startMin:number,endMin:number}>} opts.peakWindows
   */
  constructor({ startMin, tickRealMs, speedMultiplier, peakWindows }) {
    this.minutesSinceMidnight = startMin;
    this.tickRealMs = tickRealMs;
    this.speedMultiplier = speedMultiplier;
    this.peakWindows = peakWindows;

    this._intervalId = null;
    this._listeners = []; // callbacks fired on every tick
  }

  /** Subscribe to clock ticks. Returns an unsubscribe function. */
  onTick(callback) {
    this._listeners.push(callback);
    return () => {
      this._listeners = this._listeners.filter((cb) => cb !== callback);
    };
  }

  /** Starts the timer loop. Safe to call multiple times (no duplicate loops). */
  start() {
    if (this._intervalId !== null) return;

    this._intervalId = setInterval(() => {
      this._advanceTime();
      this._notifyListeners();
    }, this.tickRealMs);
  }

  /** Pauses the timer loop without resetting elapsed time. */
  stop() {
    if (this._intervalId === null) return;
    clearInterval(this._intervalId);
    this._intervalId = null;
  }

  get isRunning() {
    return this._intervalId !== null;
  }

  /** Resets simulated time back to a given point (defaults to configured start). */
  reset(toMin = CONFIG.clock.startMin) {
    this.minutesSinceMidnight = toMin;
    this._notifyListeners();
  }

  setSpeedMultiplier(multiplier) {
    this.speedMultiplier = multiplier;
  }

  /** Advances simulated minutes based on tick interval and speed multiplier. */
  _advanceTime() {
    const simSecondsPerTick = this.speedMultiplier * (this.tickRealMs / 1000);
    this.minutesSinceMidnight =
      (this.minutesSinceMidnight + simSecondsPerTick / 60) % 1440;
  }

  _notifyListeners() {
    const snapshot = {
      minutesSinceMidnight: this.minutesSinceMidnight,
      isPeak: this.isPeakHour(),
      activeWindow: this.getActiveWindow(),
    };
    this._listeners.forEach((cb) => cb(snapshot));
  }

  /** True if current simulated time falls inside any configured peak window. */
  isPeakHour(minutesSinceMidnight = this.minutesSinceMidnight) {
    return this.peakWindows.some(
      (w) => minutesSinceMidnight >= w.startMin && minutesSinceMidnight < w.endMin
    );
  }

  /** Returns the matching peak window object, or null if currently off-peak. */
  getActiveWindow(minutesSinceMidnight = this.minutesSinceMidnight) {
    return (
      this.peakWindows.find(
        (w) => minutesSinceMidnight >= w.startMin && minutesSinceMidnight < w.endMin
      ) || null
    );
  }

  /** Formats current simulated time as HH:MM (24h). */
  getFormattedTime() {
    const totalMin = Math.floor(this.minutesSinceMidnight);
    const hh = String(Math.floor(totalMin / 60)).padStart(2, "0");
    const mm = String(totalMin % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  }
}