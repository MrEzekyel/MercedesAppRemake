/** Distanza in metri fra due punti (formula dell'emisenoverso). */
export function distanceM(a: { latitude: number; longitude: number }, lat: number, lon: number): number {
  const dLat = ((lat - a.latitude) * Math.PI) / 180;
  const dLon = ((lon - a.longitude) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.latitude * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
