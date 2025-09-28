export type LatLng = { latitude: number; longitude: number };
export type SimPoint = LatLng & { timestamp?: number; speed?: number; headingDeg?: number };

type Options = {
  intervalMs?: number;   // time between points
  loop?: boolean;        // loop after reaching end
  jitterMeters?: number; // add small GPS noise
};

export class SimLocationPlayer {
  private route: LatLng[];
  private timer: ReturnType<typeof setInterval> | null = null;
  private i = 0;
  private opts: Required<Options>;
  private onTick: (p: SimPoint) => void;

  constructor(route: LatLng[], onTick: (p: SimPoint) => void, opts: Options = {}) {
    this.route = route;
    this.onTick = onTick;
    this.opts = {
      intervalMs: opts.intervalMs ?? 800,
      loop: opts.loop ?? false,
      jitterMeters: opts.jitterMeters ?? 3,
    };
  }

  start() {
    if (!this.route?.length || this.timer) return;
    this.i = 0;
    this.timer = setInterval(() => {
      const base = this.route[this.i];
      const p = this.withJitter(base, this.opts.jitterMeters);

      // rudimentary heading from previous point
      const prev = this.route[Math.max(0, this.i - 1)];
      const headingDeg = this.bearing(prev, base);

      this.onTick({ ...p, timestamp: Date.now(), headingDeg, speed: undefined });

      this.i += 1;
      if (this.i >= this.route.length) {
        if (this.opts.loop) this.i = 0;
        else this.stop();
      }
    }, this.opts.intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isRunning() {
    return !!this.timer;
  }

  private withJitter(p: LatLng, meters: number): LatLng {
    if (!meters) return p;
    const degLat = meters / 111_320;
    const degLon = meters / (111_320 * Math.cos((p.latitude * Math.PI) / 180));
    return {
      latitude: p.latitude + (Math.random() - 0.5) * 2 * degLat,
      longitude: p.longitude + (Math.random() - 0.5) * 2 * degLon,
    };
  }

  private bearing(a: LatLng, b: LatLng): number {
    const φ1 = (a.latitude * Math.PI) / 180;
    const φ2 = (b.latitude * Math.PI) / 180;
    const λ1 = (a.longitude * Math.PI) / 180;
    const λ2 = (b.longitude * Math.PI) / 180;
    const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
    return (Math.atan2(y, x) * 180) / Math.PI + 360 % 360;
  }
}
