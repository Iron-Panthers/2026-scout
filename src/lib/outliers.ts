/**
 * "Suspicious" scouting entries: a value outside its own team's usual range for that stat,
 * by Tukey's fences. Shared by the data table (red cells) and the fuel distribution charts
 * (red dots) so they always flag the same entries.
 */

/** A team needs this many submissions before its quartiles mean anything. */
export const MIN_OUTLIER_SAMPLE = 4;

/** Linear-interpolated quantile of an ascending list. */
function quantile(sorted: number[], q: number): number {
  const position = (sorted.length - 1) * q;
  const below = Math.floor(position);
  const above = Math.ceil(position);
  return sorted[below] + (sorted[above] - sorted[below]) * (position - below);
}

/**
 * Tukey's fences: values below Q1 − 1.5×IQR or above Q3 + 1.5×IQR are outliers. Null when
 * there are fewer than MIN_OUTLIER_SAMPLE values, so nothing is flagged.
 */
export function outlierFences(values: number[]): [number, number] | null {
  if (values.length < MIN_OUTLIER_SAMPLE) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  return [q1 - 1.5 * iqr, q3 + 1.5 * iqr];
}

export const isOutlier = (value: number, fences: [number, number] | null) =>
  !!fences && (value < fences[0] || value > fences[1]);
