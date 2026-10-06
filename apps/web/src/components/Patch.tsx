import React from "react";

export const Patch: React.FC<{ patch: string; reveal?: number }> = ({ patch, reveal = 1 }) => {
  const lines = patch.split("\n");
  return (
    <div className="patch">
      {lines.slice(0, Math.ceil(lines.length * reveal)).map((l, i) => (
        <div key={i} className={`line ${l.startsWith("+") && !l.startsWith("+++") ? "add" : l.startsWith("-") && !l.startsWith("---") ? "del" : l.startsWith("@@") ? "hunk" : l.startsWith("---") || l.startsWith("+++") ? "meta" : ""}`}>
          {l || " "}
        </div>
      ))}
    </div>
  );
};
