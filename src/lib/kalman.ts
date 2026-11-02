// Minimal 1-D Kalman filter for smoothing a noisy scalar stream (used twice:
// once for latitude, once for longitude). Original implementation of the
// classic predict/update equations — the same approach as the kalmanjs
// library (MIT), written fresh for Guardian.

export class Kalman1D {
  private x: number | null = null; // estimate
  private p = 1; // estimate covariance
  private readonly q: number; // process noise (how fast the true value can move)
  private readonly r: number; // measurement noise (GPS jitter)

  constructor(opts?: { processNoise?: number; measurementNoise?: number }) {
    this.q = opts?.processNoise ?? 3e-6;
    this.r = opts?.measurementNoise ?? 1e-4;
  }

  /** Feed a measurement; returns the smoothed estimate. */
  filter(z: number): number {
    if (this.x === null) {
      this.x = z;
      this.p = 1;
      return z;
    }
    // predict
    const pPred = this.p + this.q;
    // update
    const k = pPred / (pPred + this.r);
    this.x = this.x + k * (z - this.x);
    this.p = (1 - k) * pPred;
    return this.x;
  }

  reset() {
    this.x = null;
    this.p = 1;
  }
}
