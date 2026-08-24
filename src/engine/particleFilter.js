/**
 * Map-Constrained Particle Filter
 * 250 particles pruned by wall collision — keeps user locked to corridors.
 */
export class ParticleFilter {
  constructor(walls = []) {
    this.walls = walls;
    this.numParticles = 250;
    this.particles = [];
    this.estimatedPose = { x: 0, y: 0, heading: 0, floor: 1, confidence: 100, stdDevM: 0 };
    this.currentFloor = 1;
    this.pixelsPerMeter = 1; // map is already in meters
    this.initKnownPose(0, 0, 0, 1);
  }

  initKnownPose(x, y, heading = 0, floor = 1) {
    this.currentFloor = floor;
    this.particles = Array.from({ length: this.numParticles }, () => ({
      x: x + (Math.random() - 0.5) * 2,
      y: y + (Math.random() - 0.5) * 2,
      heading: heading + (Math.random() - 0.5) * 0.2,
      floor,
      weight: 1 / this.numParticles,
      alive: true,
    }));
    this._updateEstimate();
  }

  initGlobal(bounds, floor = 1) {
    this.currentFloor = floor;
    const { minX = 0, minY = 0, maxX = 100, maxY = 100 } = bounds;
    this.particles = Array.from({ length: this.numParticles }, () => ({
      x: minX + Math.random() * (maxX - minX),
      y: minY + Math.random() * (maxY - minY),
      heading: Math.random() * Math.PI * 2,
      floor,
      weight: 1 / this.numParticles,
      alive: true,
    }));
    this._updateEstimate();
  }

  step(stepLengthM, headingRad) {
    let totalW = 0;
    for (const p of this.particles) {
      if (!p.alive || p.floor !== this.currentFloor) continue;
      const nLen = stepLengthM + (Math.random() - 0.5) * 0.15;
      const nHead = headingRad + (Math.random() - 0.5) * 0.12;
      const nx = p.x + nLen * Math.cos(nHead);
      const ny = p.y + nLen * Math.sin(nHead);

      if (this._hitsWall(p.x, p.y, nx, ny)) {
        p.weight *= 0.001;
        p.alive = false;
      } else {
        p.x = nx;
        p.y = ny;
        p.heading = nHead;
      }
      totalW += p.weight;
    }

    if (totalW > 0) {
      for (const p of this.particles) p.weight /= totalW;
    } else {
      this.initKnownPose(this.estimatedPose.x, this.estimatedPose.y, headingRad, this.currentFloor);
      return;
    }

    const aliveCount = this.particles.filter(p => p.alive).length;
    if (aliveCount < this.numParticles * 0.4) this._resample();
    this._updateEstimate();
  }

  changeFloor(floor) {
    this.currentFloor = floor;
    for (const p of this.particles) p.floor = floor;
    this.estimatedPose.floor = floor;
  }

  setWalls(walls) { this.walls = walls; }

  _hitsWall(x1, y1, x2, y2) {
    for (const [wx1, wy1, wx2, wy2] of this.walls) {
      if (this._linesIntersect(x1, y1, x2, y2, wx1, wy1, wx2, wy2)) return true;
    }
    return false;
  }

  _linesIntersect(p1x, p1y, p2x, p2y, p3x, p3y, p4x, p4y) {
    const ccw = (ax, ay, bx, by, cx, cy) => (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
    return (
      ccw(p1x, p1y, p3x, p3y, p4x, p4y) !== ccw(p2x, p2y, p3x, p3y, p4x, p4y) &&
      ccw(p1x, p1y, p2x, p2y, p3x, p3y) !== ccw(p1x, p1y, p2x, p2y, p4x, p4y)
    );
  }

  _resample() {
    const step = 1 / this.numParticles;
    let r = Math.random() * step, c = this.particles[0].weight, i = 0;
    const next = [];
    for (let m = 0; m < this.numParticles; m++) {
      const u = r + m * step;
      while (u > c && i < this.particles.length - 1) { i++; c += this.particles[i].weight; }
      const p = this.particles[i];
      next.push({ x: p.x + (Math.random()-0.5)*0.5, y: p.y + (Math.random()-0.5)*0.5,
                  heading: p.heading + (Math.random()-0.5)*0.06,
                  floor: p.floor, weight: 1/this.numParticles, alive: true });
    }
    this.particles = next;
  }

  _updateEstimate() {
    let sumX=0, sumY=0, sumW=0, cosH=0, sinH=0;
    for (const p of this.particles) {
      if (p.floor !== this.currentFloor) continue;
      sumX += p.x * p.weight; sumY += p.y * p.weight;
      cosH += Math.cos(p.heading) * p.weight; sinH += Math.sin(p.heading) * p.weight;
      sumW += p.weight;
    }
    if (sumW === 0) return;
    const mx = sumX/sumW, my = sumY/sumW;
    let variance = 0;
    for (const p of this.particles) {
      if (p.floor !== this.currentFloor) continue;
      variance += ((p.x-mx)**2 + (p.y-my)**2) * p.weight;
    }
    const stdDevM = Math.sqrt(variance/sumW);
    const confidence = Math.max(10, Math.min(100, Math.round(100 - stdDevM*6)));
    this.estimatedPose = { x: mx, y: my, heading: Math.atan2(sinH,cosH),
                           floor: this.currentFloor, confidence, stdDevM };
  }
}
