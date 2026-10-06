export const pct = (x: number | null | undefined, digits = 1): string => (x === null || x === undefined || Number.isNaN(x) ? "–" : `${(x * 100).toFixed(digits)}%`);
export const pts = (x: number, digits = 1): string => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(digits)} pts`;
export const money = (x: number): string => (x >= 1000 ? `$${(x / 1000).toFixed(x >= 100000 ? 0 : 1)}k` : `$${x.toFixed(0)}`);
export const moneyFull = (x: number): string => `$${x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const day = (iso: string): string => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
export const dateTime = (iso: string): string => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export const relative = (iso: string): string => {
  const d = (Date.now() - Date.parse(iso)) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.round(d / 60)} min ago`;
  if (d < 86400) return `${Math.round(d / 3600)} h ago`;
  return day(iso);
};
export const n = (x: number): string => x.toLocaleString();
