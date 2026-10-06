import React from "react";
import type { GoldenVersion } from "@blindspot/core";
import { dateTime } from "../lib/format";

export const VersionTimeline: React.FC<{ versions: GoldenVersion[]; current: string; onSelect?: (v: string) => void; selected?: string }> = ({ versions, current, onSelect, selected }) => (
  <div className="timeline">
    {versions
      .slice()
      .reverse()
      .map((v, i, arr) => (
        <div key={v.version} className={`tl-item ${v.version === current ? "current" : ""}`} style={{ cursor: onSelect ? "pointer" : "default" }} onClick={() => onSelect?.(v.version)} {...(onSelect ? { tabIndex: 0, role: "button", "aria-pressed": selected === v.version, onKeyDown: (e: React.KeyboardEvent) => (e.key === "Enter" || e.key === " " ? (e.preventDefault(), onSelect(v.version)) : undefined) } : {})}>
          <div className="rail">
            <div className="node" />
            {i < arr.length - 1 ? <div className="line" /> : null}
          </div>
          <div className="body">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <b>{v.version}</b>
              {v.version === current ? <span className="badge pass">current</span> : null}
              {selected === v.version ? <span className="badge accent">viewing</span> : null}
              <span className="small faint num">{v.case_ids.length} cases</span>
            </div>
            <div className="small muted">{v.note}</div>
            <div className="small faint mono">
              {dateTime(v.created_at)} · sha256 {v.sha256.slice(0, 16)}…{v.parent ? ` · parent ${v.parent}` : ""}
            </div>
          </div>
        </div>
      ))}
  </div>
);
