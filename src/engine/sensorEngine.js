/**
 * SensorEngine — Fuses GPS + Accelerometer + Gyroscope + Barometer
 * into continuous (x, y, floor, heading, stepCount, totalDistanceM) updates.
 * All permissions are already granted before this module starts.
 */
import * as Location from "expo-location";
import { Accelerometer, Gyroscope, Magnetometer, Barometer } from "expo-sensors";

// Haversine distance in meters between two GPS coords
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// GPS coord to local XY in meters from anchor point
function gpsToXY(lat, lng, anchorLat, anchorLng) {
  const x = haversineMeters(anchorLat, anchorLng, anchorLat, lng) * (lng > anchorLng ? 1 : -1);
  const y = haversineMeters(anchorLat, anchorLng, lat, anchorLng) * (lat > anchorLat ? 1 : -1);
  return { x, y };
}

export class SensorEngine {
  constructor(onUpdate) {
    this.onUpdate = onUpdate;

    // Anchor GPS point (first fix sets origin 0,0)
    this.anchorLat = null;
    this.anchorLng = null;
    this.anchorX = 0;
    this.anchorY = 0;

    // State
    this.x = 0;
    this.y = 0;
    this.floor = 1;
    this.heading = 0; // radians
    this.stepCount = 0;
    this.totalDistanceM = 0;

    // Step detection
    this.accelBuffer = [];
    this.bufferSize = 20;
    this.lastStepTime = 0;
    this.stepThreshold = 1.45;
    this.minStepIntervalMs = 260;
    this.weinbergK = 0.48;
    this.lastAccelMag = 0;

    // Barometer baseline
    this.baselinePressure = null;
    this.FLOOR_PRESSURE_DELTA = 120; // Pa per floor (approx)

    // Subscriptions
    this._accelSub = null;
    this._magnetSub = null;
    this._baroSub = null;
    this._gpsSub = null;

    this.isRunning = false;
  }

  setInitialAnchor(lat, lng, x = 0, y = 0, floor = 1) {
    this.anchorLat = lat;
    this.anchorLng = lng;
    this.anchorX = x;
    this.anchorY = y;
    this.x = x;
    this.y = y;
    this.floor = floor;
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // 1. GPS — continuous position updates
    try {
      this._gpsSub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 1000, distanceInterval: 0.5 },
        (pos) => this._onGPS(pos)
      );
    } catch (e) {
      console.warn("GPS watch error:", e);
    }

    // 2. Accelerometer — step detection at 50Hz
    try {
      Accelerometer.setUpdateInterval(20);
      this._accelSub = Accelerometer.addListener((data) => this._onAccelerometer(data));
    } catch (e) {
      console.warn("Accelerometer error:", e);
    }

    // 3. Magnetometer — compass heading
    try {
      Magnetometer.setUpdateInterval(100);
      this._magnetSub = Magnetometer.addListener((data) => this._onMagnetometer(data));
    } catch (e) {
      console.warn("Magnetometer error:", e);
    }

    // 4. Barometer — floor detection (optional hardware)
    try {
      Barometer.setUpdateInterval(1000);
      this._baroSub = Barometer.addListener((data) => this._onBarometer(data));
    } catch (e) {
      console.warn("Barometer not available on this device:", e);
    }
  }

  stop() {
    this.isRunning = false;
    this._gpsSub?.remove?.();
    this._accelSub?.remove?.();
    this._magnetSub?.remove?.();
    this._baroSub?.remove?.();
  }

  _onGPS(pos) {
    const { latitude, longitude, accuracy } = pos.coords;
    if (accuracy > 20) return; // Ignore poor GPS fixes

    if (!this.anchorLat) {
      // Set first GPS fix as origin
      this.setInitialAnchor(latitude, longitude, 0, 0, this.floor);
      return;
    }

    // When GPS is good, use it to correct PDR drift
    if (accuracy < 15) {
      const { x, y } = gpsToXY(latitude, longitude, this.anchorLat, this.anchorLng);
      // Gentle EKF-style correction: blend GPS into PDR position
      this.x = this.x * 0.7 + (x + this.anchorX) * 0.3;
      this.y = this.y * 0.7 + (y + this.anchorY) * 0.3;
      this._emit();
    }
  }

  _onAccelerometer({ x: ax, y: ay, z: az }) {
    const mag = Math.sqrt(ax * ax + ay * ay + az * az) - 9.81;
    this.accelBuffer.push(mag);
    if (this.accelBuffer.length > this.bufferSize) this.accelBuffer.shift();

    const now = performance.now();
    if (mag > this.stepThreshold && now - this.lastStepTime > this.minStepIntervalMs) {
      const maxVal = Math.max(...this.accelBuffer);
      const minVal = Math.min(...this.accelBuffer);
      const diff = Math.max(0.1, maxVal - minVal);
      const stepLen = Math.min(0.95, Math.max(0.45, this.weinbergK * Math.pow(diff, 0.25)));
      this.lastStepTime = now;
      this._applyStep(stepLen);
    }
  }

  _onMagnetometer({ x: mx, y: my }) {
    // Heading in radians (0 = East in canvas coords, positive = clockwise)
    this.heading = Math.atan2(my, mx);
  }

  _onBarometer({ pressure }) {
    if (!this.baselinePressure) {
      this.baselinePressure = pressure;
      return;
    }
    const deltaPa = this.baselinePressure - pressure;
    const floorsUp = Math.round(deltaPa / this.FLOOR_PRESSURE_DELTA);
    const newFloor = Math.max(1, 1 + floorsUp);
    if (newFloor !== this.floor) {
      this.floor = newFloor;
      this._emit();
    }
  }

  _applyStep(stepLengthM) {
    this.x += stepLengthM * Math.cos(this.heading);
    this.y += stepLengthM * Math.sin(this.heading);
    this.stepCount++;
    this.totalDistanceM += stepLengthM;
    this._emit();
  }

  simulateStep(headingRad = this.heading) {
    this.heading = headingRad;
    this._applyStep(0.75);
  }

  _emit() {
    if (this.onUpdate) {
      this.onUpdate({
        x: this.x,
        y: this.y,
        floor: this.floor,
        heading: this.heading,
        stepCount: this.stepCount,
        totalDistanceM: this.totalDistanceM,
      });
    }
  }
}
