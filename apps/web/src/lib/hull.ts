export type Pt = [number, number];

export function convexHull(points: Pt[]): Pt[] {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2] as Pt, lower[lower.length - 1] as Pt, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i] as Pt;
    while (upper.length >= 2 && cross(upper[upper.length - 2] as Pt, upper[upper.length - 1] as Pt, p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

export function expandHull(hull: Pt[], pad: number): Pt[] {
  if (hull.length === 0) return hull;
  const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length;
  const cy = hull.reduce((s, p) => s + p[1], 0) / hull.length;
  return hull.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.hypot(dx, dy) || 1;
    return [x + (dx / d) * pad, y + (dy / d) * pad];
  });
}

export function roundedPath(pts: Pt[]): string {
  if (pts.length < 3) return "";
  let d = "";
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[(i - 1 + pts.length) % pts.length] as Pt;
    const p1 = pts[i] as Pt;
    const p2 = pts[(i + 1) % pts.length] as Pt;
    const m1: Pt = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    const m2: Pt = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
    d += i === 0 ? `M ${m1[0]} ${m1[1]} ` : "";
    d += `Q ${p1[0]} ${p1[1]} ${m2[0]} ${m2[1]} `;
  }
  return d + "Z";
}
