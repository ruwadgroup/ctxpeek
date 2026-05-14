/** Rough char→token estimator. See design doc §14 Tier S #2. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}k`;
  return `${(n / (1024 * 1024)).toFixed(1)}M`;
}

export function parseSize(s: string): number {
  const m = /^(\d+(?:\.\d+)?)\s*(B|KB|KiB|MB|MiB|GB|GiB)?$/i.exec(s.trim());
  if (!m) throw new Error(`invalid size: ${s}`);
  const n = Number(m[1]);
  const unit = (m[2] ?? "B").toUpperCase();
  const mult: Record<string, number> = {
    B: 1,
    KB: 1000,
    KIB: 1024,
    MB: 1000 * 1000,
    MIB: 1024 * 1024,
    GB: 1000 * 1000 * 1000,
    GIB: 1024 * 1024 * 1024,
  };
  const factor = mult[unit];
  if (factor === undefined) throw new Error(`invalid size unit: ${unit}`);
  return Math.round(n * factor);
}

export function formatRelativeAge(iso: string, now: Date = new Date()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "?";
  const ms = now.getTime() - t;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}
