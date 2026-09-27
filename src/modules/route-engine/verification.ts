// Hermes and V8 can differ in the last floating-point digits. Absolute tolerance
// is 1e-6 (meters for points, points for raw score); ordering and structure are exact.
// This tolerance is declared before device comparison, not fitted to its output.
export function compareReference(actual: unknown, expected: unknown): string | null {
  const normalize = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
  function compare(a: unknown, b: unknown, path: string): string | null {
    if (typeof a === 'number' && typeof b === 'number') return Number.isFinite(a) && Math.abs(a - b) <= 1e-6 ? null : path;
    if (a === b) return null;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return path;
    if (Array.isArray(a) !== Array.isArray(b)) return path;
    const aa = a as Record<string, unknown>, bb = b as Record<string, unknown>;
    const ak = Object.keys(aa).sort(), bk = Object.keys(bb).sort();
    if (ak.join('|') !== bk.join('|')) return `${path}.keys`;
    for (const key of ak) { const mismatch = compare(aa[key], bb[key], `${path}.${key}`); if (mismatch) return mismatch; }
    return null;
  }
  return compare(normalize(actual), normalize(expected), 'result');
}
