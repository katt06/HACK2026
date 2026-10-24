export function median(values: number[]): number {
  return percentile(values, 0.5);
}

// Linear interpolation between closest ranks; p in [0, 1]. Returns 0 for an empty list.
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
}
