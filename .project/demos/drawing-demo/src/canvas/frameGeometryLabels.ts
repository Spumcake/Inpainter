/** Greatest common divisor for positive integers. */
function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

/**
 * Reduced aspect label from output resolution (e.g. 1280×720 → `16:9`).
 * Not derived from crop / card size.
 */
export function formatAspectRatio(width: number, height: number): string {
  const w = Math.max(1, Math.round(Math.abs(width)));
  const h = Math.max(1, Math.round(Math.abs(height)));
  const d = gcd(w, h);
  return `${w / d} : ${h / d}`;
}

/**
 * Resolution pill label — full output size with spaced colon (e.g. `1280 : 720`).
 */
export function formatResolutionLabel(width: number, height: number): string {
  const w = Math.max(1, Math.round(Math.abs(width)));
  const h = Math.max(1, Math.round(Math.abs(height)));
  return `${w} : ${h}`;
}
