export const HEX_RADIUS = 220;
export const BALL_RADIUS = 13;
const GRAVITY = 700;          // px/s^2
const RESTITUTION = 0.82;     // bounce energy retention
const VEL_DAMPING = 0.999;    // per-frame air damping
const WALL_DRAG = 0.25;       // how much rotating wall imparts velocity to ball
const MAX_VEL = 1000;
const SUB_STEPS = 4;

export function createPhysics(centerX, centerY) {
  const balls = [];
  let rotation = 0;
  let angularVel = 0.5;
  let gapsOpen = false;
  let gravity = GRAVITY;

  function spawnBall(note, color) {
    balls.push({
      x: centerX + (Math.random() - 0.5) * 30,
      y: centerY - HEX_RADIUS * 0.5,
      vx: (Math.random() - 0.5) * 60,
      vy: 0,
      r: BALL_RADIUS,
      note,
      color,
      bornAt: performance.now()
    });
  }

  function getVertices() {
    const verts = [];
    for (let i = 0; i < 6; i++) {
      const angle = rotation + i * Math.PI / 3 - Math.PI / 2;
      verts.push({
        x: centerX + Math.cos(angle) * HEX_RADIUS,
        y: centerY + Math.sin(angle) * HEX_RADIUS
      });
    }
    return verts;
  }

  function clampVel(b) {
    const s = Math.hypot(b.vx, b.vy);
    if (s > MAX_VEL) {
      b.vx = b.vx / s * MAX_VEL;
      b.vy = b.vy / s * MAX_VEL;
    }
  }

  function stepOnce(dt, onBounce) {
    rotation += angularVel * dt;

    for (const b of balls) {
      b.vy += gravity * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vx *= VEL_DAMPING;
      b.vy *= VEL_DAMPING;
    }

    const verts = getVertices();
    for (const b of balls) {
      for (let i = 0; i < 6; i++) {
        if (gapsOpen && i % 2 === 0) continue;
        const a = verts[i];
        const c = verts[(i + 1) % 6];
        const ax = c.x - a.x, ay = c.y - a.y;
        const len2 = ax * ax + ay * ay;
        if (len2 < 1e-6) continue;
        const t = Math.max(0, Math.min(1, ((b.x - a.x) * ax + (b.y - a.y) * ay) / len2));
        const px = a.x + t * ax, py = a.y + t * ay;
        const dx = b.x - px, dy = b.y - py;
        const dist = Math.hypot(dx, dy);
        if (dist < b.r && dist > 1e-6) {
          const nx = dx / dist, ny = dy / dist;
          // push out
          b.x = px + nx * b.r;
          b.y = py + ny * b.r;
          // velocity of wall point (rotating around center)
          const wvx = -angularVel * (py - centerY);
          const wvy = angularVel * (px - centerX);
          // ball velocity relative to wall
          const rvx = b.vx - wvx;
          const rvy = b.vy - wvy;
          const rDotN = rvx * nx + rvy * ny;
          if (rDotN < 0) {
            const impact = Math.hypot(rvx, rvy);
            // reflect relative velocity
            const newRvx = rvx - 2 * rDotN * nx * RESTITUTION;
            const newRvy = rvy - 2 * rDotN * ny * RESTITUTION;
            b.vx = newRvx + wvx * (1 + WALL_DRAG);
            b.vy = newRvy + wvy * (1 + WALL_DRAG);
            clampVel(b);
            onBounce(b.note, impact);
          }
        }
      }
    }

    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i], b = balls[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minDist = a.r + b.r;
        if (dist < minDist && dist > 1e-6) {
          const nx = dx / dist, ny = dy / dist;
          const overlap = (minDist - dist) / 2;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;
          const aVN = a.vx * nx + a.vy * ny;
          const bVN = b.vx * nx + b.vy * ny;
          if (aVN - bVN > 0) {
            a.vx += (bVN - aVN) * nx;
            a.vy += (bVN - aVN) * ny;
            b.vx += (aVN - bVN) * nx;
            b.vy += (aVN - bVN) * ny;
            clampVel(a); clampVel(b);
          }
        }
      }
    }

    // remove balls that have escaped far from the hex
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      if (Math.hypot(b.x - centerX, b.y - centerY) > HEX_RADIUS * 3) {
        balls.splice(i, 1);
      }
    }
  }

  function step(dtMs, onBounce) {
    const cappedMs = Math.min(50, dtMs);
    const subDt = (cappedMs / 1000) / SUB_STEPS;
    for (let i = 0; i < SUB_STEPS; i++) stepOnce(subDt, onBounce);
  }

  return {
    spawnBall,
    setAngularVel(v) { angularVel = v; },
    setGapsOpen(o) { gapsOpen = o; },
    setGravity(g) { gravity = g; },
    isGapsOpen: () => gapsOpen,
    getRotation: () => rotation,
    getBalls: () => balls,
    getVertices,
    step
  };
}
