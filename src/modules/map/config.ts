export function mapStyleUrl(key: string | undefined): string | null {
  const value = key?.trim();
  return value ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(value)}` : null;
}
