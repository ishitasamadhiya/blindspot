import React from "react";

function render(value: unknown, path: string, indent: number, highlight: Set<string>, good: Set<string>, out: React.ReactNode[], key: string): void {
  const pad = "  ".repeat(indent);
  const cls = (p: string) => (highlight.has(p) ? " hl" : good.has(p) ? " hl good" : "");
  if (Array.isArray(value)) {
    out.push(<span key={`${key}-o`}>[{"\n"}</span>);
    value.forEach((v, i) => {
      out.push(<span key={`${key}-${i}-p`}>{pad}  </span>);
      render(v, `${path}[]`, indent + 1, highlight, good, out, `${key}-${i}`);
      out.push(<span key={`${key}-${i}-c`}>{i < value.length - 1 ? "," : ""}{"\n"}</span>);
    });
    out.push(<span key={`${key}-e`}>{pad}]</span>);
    return;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    out.push(<span key={`${key}-o`}>{"{"}{"\n"}</span>);
    entries.forEach(([k, v], i) => {
      const p = path ? `${path}.${k}` : k;
      out.push(
        <span key={`${key}-${k}-k`} className={cls(p)}>
          {pad}  <span className="k">"{k}"</span>:{" "}
        </span>,
      );
      render(v, p, indent + 1, highlight, good, out, `${key}-${k}`);
      out.push(<span key={`${key}-${k}-c`}>{i < entries.length - 1 ? "," : ""}{"\n"}</span>);
    });
    out.push(<span key={`${key}-e`}>{pad}{"}"}</span>);
    return;
  }
  if (typeof value === "string") out.push(<span key={key} className={`s${cls(path)}`}>"{value}"</span>);
  else out.push(<span key={key} className={`n${cls(path)}`}>{String(value)}</span>);
}

export function topLevelDiff(a: object, b: object): { onlyA: string[]; onlyB: string[] } {
  const ka = new Set(Object.keys(a));
  const kb = new Set(Object.keys(b));
  return { onlyA: [...ka].filter((k) => !kb.has(k)), onlyB: [...kb].filter((k) => !ka.has(k)) };
}

export const ClaimJson: React.FC<{ claim: unknown; highlight?: string[]; good?: string[]; maxHeight?: number; style?: React.CSSProperties; focusable?: boolean }> = ({ claim, highlight = [], good = [], maxHeight, style, focusable = false }) => {
  const out: React.ReactNode[] = [];
  render(claim, "", 0, new Set(highlight), new Set(good), out, "r");
  return (
    <div className="json" style={{ maxHeight, ...style }} {...(focusable ? { tabIndex: 0, role: "region", "aria-label": "claim JSON" } : {})}>
      {out}
    </div>
  );
};

export const ClaimDiff: React.FC<{ left: { title: string; claim: object }; right: { title: string; claim: object }; maxHeight?: number }> = ({ left, right, maxHeight = 420 }) => {
  const d = topLevelDiff(left.claim, right.claim);
  return (
    <div className="grid cols-2">
      <div>
        <div className="small muted" style={{ marginBottom: 6 }}>
          {left.title} <span className="faint">· fields the other side lacks are highlighted</span>
        </div>
        <ClaimJson claim={left.claim} good={d.onlyA} maxHeight={maxHeight} focusable />
      </div>
      <div>
        <div className="small muted" style={{ marginBottom: 6 }}>
          {right.title}
        </div>
        <ClaimJson claim={right.claim} highlight={d.onlyB} maxHeight={maxHeight} focusable />
      </div>
    </div>
  );
};
