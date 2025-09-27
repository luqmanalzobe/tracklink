// src/utils/smoothNavigation.ts
import * as Location from 'expo-location';

export type LatLng = { latitude: number; longitude: number };

export class SmoothLocationTracker {
  private lastRawPosition: LatLng | null = null;
  private lastSmoothedPosition: LatLng | null = null;
  private lastHeading: number = 0;
  private lastSpeed: number = 0;
  private lastUpdateTime: number = Date.now();
  // RN returns number for setInterval; Node returns NodeJS.Timeout. Use ReturnType for portability.
  private interpolationTimer: ReturnType<typeof setInterval> | null = null;
  private onUpdate: (position: LatLng, heading: number) => void;

  constructor(onUpdate: (position: LatLng, heading: number) => void) {
    this.onUpdate = onUpdate;
  }

  // Kalman-like (EMA) smoothing of GPS noise
  private smoothPosition(raw: LatLng, speed: number): LatLng {
    if (!this.lastSmoothedPosition) {
      this.lastSmoothedPosition = raw;
      return raw;
    }
    const speedKmh = speed * 3.6;
    const smoothingFactor = speedKmh > 50 ? 0.3 : speedKmh > 20 ? 0.5 : 0.7;

    return {
      latitude:
        this.lastSmoothedPosition.latitude * smoothingFactor +
        raw.latitude * (1 - smoothingFactor),
      longitude:
        this.lastSmoothedPosition.longitude * smoothingFactor +
        raw.longitude * (1 - smoothingFactor),
    };
  }

  // Dead-reckoning / forward prediction
  private predictNextPosition(
    current: LatLng,
    speedMps: number,
    headingDeg: number,
    deltaTimeSec: number
  ): LatLng {
    if (speedMps < 0.5) return current;

    const distance = speedMps * deltaTimeSec;
    const R = 6371000;
    const d = distance / R;
    const heading = (headingDeg * Math.PI) / 180;
    const lat1 = (current.latitude * Math.PI) / 180;
    const lon1 = (current.longitude * Math.PI) / 180;

    const lat2 =
      Math.asin(
        Math.sin(lat1) * Math.cos(d) +
          Math.cos(lat1) * Math.sin(d) * Math.cos(heading)
      );
    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(heading) * Math.sin(d) * Math.cos(lat1),
        Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
      );

    return { latitude: (lat2 * 180) / Math.PI, longitude: (lon2 * 180) / Math.PI };
  }

  private startInterpolation() {
    // If we’re not moving, don’t burn cycles
    if (this.lastSpeed < 0.5) {
      this.stopInterpolation();
      return;
    }
    this.stopInterpolation();
    this.interpolationTimer = setInterval(() => {
      if (!this.lastSmoothedPosition || this.lastSpeed < 0.5) return;
      const now = Date.now();
      const deltaTime = (now - this.lastUpdateTime) / 1000;

      const predicted = this.predictNextPosition(
        this.lastSmoothedPosition,
        this.lastSpeed,
        this.lastHeading,
        deltaTime
      );

      this.onUpdate(predicted, this.lastHeading);
    }, 50); // ~20fps
  }

  private stopInterpolation() {
    if (this.interpolationTimer) {
      clearInterval(this.interpolationTimer);
      this.interpolationTimer = null;
    }
  }

  public updatePosition(loc: Location.LocationObject) {
    const raw: LatLng = {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
    };

    const speed = loc.coords.speed ?? 0;
    const headingVal = loc.coords.heading;
    // Guard against NaN on some Android devices
    const heading =
      typeof headingVal === 'number' && Number.isFinite(headingVal)
        ? headingVal
        : this.lastHeading;

    const smoothed = this.smoothPosition(raw, speed);

    this.lastRawPosition = raw;
    this.lastSmoothedPosition = smoothed;
    this.lastHeading = heading;
    this.lastSpeed = speed;
    this.lastUpdateTime = Date.now();

    // Immediate callback for snappy UI
    this.onUpdate(smoothed, heading);

    // Keep interpolation in sync with movement state
    this.startInterpolation();
  }

  public stop() {
    this.stopInterpolation();
  }
}

// Configuration for smooth navigation
export const SMOOTH_NAV_CONFIG = {
  GPS: {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 500,
    distanceInterval: 1,
  },
  CAMERA: {
    animationDuration: 300,
    zoomLevel: {
      city: 17.5,
      highway: 16.5,
    },
    pitch: {
      stopped: 0,
      slow: 45,
      fast: 60,
    },
  },
  SPEED_THRESHOLDS: {
    stopped: 3,
    slow: 30,
    medium: 60,
    fast: 90,
  },
} as const;

export function getCameraSettings(speedKmh: number) {
  const { CAMERA, SPEED_THRESHOLDS } = SMOOTH_NAV_CONFIG;

  let zoom = CAMERA.zoomLevel.city;
  let pitch = CAMERA.pitch.slow;

  if (speedKmh < SPEED_THRESHOLDS.stopped) {
    pitch = CAMERA.pitch.stopped;
    zoom = 18;
  } else if (speedKmh < SPEED_THRESHOLDS.slow) {
    pitch = CAMERA.pitch.slow;
    zoom = 17.5;
  } else if (speedKmh < SPEED_THRESHOLDS.medium) {
    pitch = CAMERA.pitch.slow;
    zoom = 17;
  } else if (speedKmh < SPEED_THRESHOLDS.fast) {
    pitch = CAMERA.pitch.fast;
    zoom = 16.5;
  } else {
    pitch = CAMERA.pitch.fast;
    zoom = 16;
  }

  return { zoom, pitch };
}
