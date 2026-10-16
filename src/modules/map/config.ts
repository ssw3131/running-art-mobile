export function mapStyleUrl(key: string | undefined): string | null {
  const value = key?.trim();
  return value ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(value)}` : null;
}

/** Keep the existing Streets v2 cartography; change only its official dark variant. */
export function themedMapStyle(url: string, dark: boolean): string {
  return dark ? url.replace('/maps/streets-v2/style.json', '/maps/streets-v2-dark/style.json') : url;
}
