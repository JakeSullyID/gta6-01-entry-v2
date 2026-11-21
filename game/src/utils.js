// Mathematical helpers and bounding utility functions
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function angleDelta(a, b) {
  return wrapAngle(b - a);
}

export function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

export function makeRng(seed) {
  let s = seed >>> 0;
  return function() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function pick(rng, arr) {
  if (!arr || arr.length === 0) return null;
  const idx = Math.floor(rng() * arr.length);
  return arr[Math.min(idx, arr.length - 1)];
}

export function circleVsAabb(px, pz, r, box) {
  const { minX, maxX, minZ, maxZ } = box;
  const cx = clamp(px, minX, maxX);
  const cz = clamp(pz, minZ, maxZ);
  const dx = px - cx;
  const dz = pz - cz;
  const d2 = dx * dx + dz * dz;

  if (d2 > r * r) {
    return null;
  }

  const dist = Math.sqrt(d2);
  if (dist > 1e-5) {
    const depth = r - dist;
    return {
      nx: dx / dist,
      nz: dz / dist,
      depth
    };
  } else {
    // Circle center is inside box
    const dLeft = px - minX;
    const dRight = maxX - px;
    const dTop = pz - minZ;
    const dBot = maxZ - pz;
    const minD = Math.min(dLeft, dRight, dTop, dBot);

    if (minD === dLeft) return { nx: -1, nz: 0, depth: r + dLeft };
    if (minD === dRight) return { nx: 1, nz: 0, depth: r + dRight };
    if (minD === dTop) return { nx: 0, nz: -1, depth: r + dTop };
    return { nx: 0, nz: 1, depth: r + dBot };
  }
}
