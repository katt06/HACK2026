// Small pure helpers for the deck charts.

// 0 and "nice" steps (1, 2, 5 × 10^k) up to at least max.
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const step = [1, 2, 2.5, 5, 10].map((m) => m * 10 ** Math.floor(Math.log10(raw))).find((s) => s >= raw)!;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => Math.round(i * step * 1e6) / 1e6);
}

export function linePath(points: [number, number][]): string {
  return points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
}

// A closed band between an upper and lower line (for confidence intervals).
export function bandPath(upper: [number, number][], lower: [number, number][]): string {
  return `${linePath(upper)}${[...lower].reverse().map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join("")}Z`;
}
