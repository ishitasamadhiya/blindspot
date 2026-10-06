import React, { useMemo } from "react";
import type { BlindSpot, MapPoint } from "@blindspot/core";
import { convexHull, expandHull, roundedPath, type Pt } from "../lib/hull";

const CLUSTER_COLORS = ["#e03b3b", "#e07b2a", "#c23bb0", "#7b61e0", "#2aa7a0", "#8a8a2a"];

export function clusterColor(clusterId: string | undefined): string {
  if (!clusterId) return "var(--uncovered)";
  const i = parseInt(clusterId.replace(/\D/g, ""), 10) - 1;
  return CLUSTER_COLORS[i % CLUSTER_COLORS.length] as string;
}

export const CoverageMap: React.FC<{
  points: MapPoint[];
  blindSpots: BlindSpot[];
  selected?: string | null;
  onSelect?: (clusterId: string | null) => void;
  width?: number;
  height?: number;
  reveal?: number;
  showLabels?: boolean;
  showHulls?: boolean;
  dim?: boolean;
}> = ({ points, blindSpots, selected = null, onSelect, width = 760, height = 520, reveal = 1, showLabels = true, showHulls = true, dim = false }) => {
  const layout = useMemo(() => {
    if (points.length === 0) return null;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = 36;
    const sx = (x: number) => pad + ((x - minX) / (maxX - minX || 1)) * (width - pad * 2);
    const sy = (y: number) => pad + (1 - (y - minY) / (maxY - minY || 1)) * (height - pad * 2);
    const golden = points.filter((p) => p.kind === "golden");
    const covered = points.filter((p) => p.kind === "covered");
    const uncovered = points.filter((p) => p.kind === "uncovered");
    const hulls = blindSpots.map((b) => {
      const members = points.filter((p) => p.cluster_id === b.cluster_id).map((p) => [sx(p.x), sy(p.y)] as Pt);
      const hull = expandHull(convexHull(members), 14);
      const cx = members.reduce((s, p) => s + p[0], 0) / Math.max(1, members.length);
      const cy = members.reduce((s, p) => s + p[1], 0) / Math.max(1, members.length);
      return { spot: b, path: roundedPath(hull), cx, cy, n: members.length };
    });
    return { sx, sy, golden, covered, uncovered, hulls };
  }, [points, blindSpots, width, height]);
  if (!layout) return <div className="empty">No coverage run yet.</div>;
  const { sx, sy, golden, covered, uncovered, hulls } = layout;
  const take = <T,>(arr: T[], frac: number) => arr.slice(0, Math.ceil(arr.length * frac));
  const goldenReveal = Math.min(1, reveal * 3);
  const coveredReveal = Math.min(1, Math.max(0, reveal * 3 - 1));
  const uncoveredReveal = Math.min(1, Math.max(0, reveal * 3 - 2));
  return (
    <div className="map-wrap">
      <svg className="map" viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="Traffic map: golden set versus last seven days of production traffic" onClick={() => onSelect?.(null)}>
        <rect x={0} y={0} width={width} height={height} rx={8} fill="var(--surface-2)" stroke="var(--border)" />
        {take(golden, goldenReveal).map((p) => (
          <circle key={p.id} cx={sx(p.x)} cy={sy(p.y)} r={2.6} fill="var(--golden)" opacity={dim ? 0.35 : 0.75} />
        ))}
        {take(covered, coveredReveal).map((p) => (
          <circle key={p.id} cx={sx(p.x)} cy={sy(p.y)} r={2.4} fill="var(--covered)" opacity={dim ? 0.3 : 0.7} />
        ))}
        {showHulls && uncoveredReveal > 0
          ? hulls.map((h) => (
              <path
                key={h.spot.cluster_id}
                d={h.path}
                className="hull"
                fill={clusterColor(h.spot.cluster_id)}
                stroke={clusterColor(h.spot.cluster_id)}
                opacity={uncoveredReveal * (selected && selected !== h.spot.cluster_id ? 0.35 : 1)}
                style={{ cursor: onSelect ? "pointer" : "default" }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect?.(h.spot.cluster_id);
                }}
              />
            ))
          : null}
        {take(uncovered, uncoveredReveal).map((p) => (
          <circle
            key={p.id}
            cx={sx(p.x)}
            cy={sy(p.y)}
            r={selected === p.cluster_id ? 3.4 : 2.8}
            fill={clusterColor(p.cluster_id)}
            opacity={selected && selected !== p.cluster_id ? 0.3 : 0.95}
            style={{ cursor: onSelect ? "pointer" : "default" }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(p.cluster_id ?? null);
            }}
          />
        ))}
        {showLabels && uncoveredReveal >= 1
          ? hulls.map((h, i) => (
              <g key={h.spot.cluster_id} transform={`translate(${Math.min(width - 150, Math.max(10, h.cx - 60))}, ${Math.max(16, h.cy - 26 - (i % 2) * 14)})`} opacity={selected && selected !== h.spot.cluster_id ? 0.5 : 1}>
                <rect x={-6} y={-13} width={Math.min(260, h.spot.name.length * 6.6 + 42)} height={20} rx={10} fill="var(--surface)" stroke={clusterColor(h.spot.cluster_id)} />
                <circle cx={4} cy={-3} r={4} fill={clusterColor(h.spot.cluster_id)} />
                <text x={14} y={1} fontSize="11.5" fontWeight={600} fill="var(--text)">
                  {h.spot.cluster_id} · {h.spot.name.length > 34 ? `${h.spot.name.slice(0, 34)}…` : h.spot.name}
                </text>
              </g>
            ))
          : null}
      </svg>
      <div className="map-legend">
        <span>
          <span className="dot" style={{ background: "var(--golden)" }} /> golden set ({golden.length})
        </span>
        <span>
          <span className="dot" style={{ background: "var(--covered)" }} /> covered traffic ({covered.length})
        </span>
        <span>
          <span className="dot" style={{ background: "var(--uncovered)" }} /> uncovered traffic ({uncovered.length})
        </span>
        <span className="faint">2-D PCA of claim embeddings; hulls are blind spots</span>
      </div>
    </div>
  );
};
