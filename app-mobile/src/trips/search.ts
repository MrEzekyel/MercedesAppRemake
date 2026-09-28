/**
 * Ricerca indirizzi con completamento, per salvare un luogo.
 *
 * Apple non espone il completamento (MKLocalSearchCompleter) a Expo Go:
 * si usa Photon, il motore di ricerca libero di OpenStreetMap, con i
 * risultati vicini alla posizione indicata messi per primi. Riceve solo il
 * testo digitato e quella posizione.
 */
export interface AddressHit {
  key: string;
  title: string;
  detail: string;
  latitude: number;
  longitude: number;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_id?: number;
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    district?: string;
    county?: string;
  };
}

export async function searchAddress(
  query: string, near: { latitude: number; longitude: number } | null, signal?: AbortSignal
): Promise<AddressHit[]> {
  // Parametri scritti a mano: URLSearchParams di React Native ignora
  // l'oggetto passato al costruttore e la ricerca partiva senza testo.
  let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6`;
  if (near) url += `&lat=${near.latitude.toFixed(5)}&lon=${near.longitude.toFixed(5)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const body = (await res.json()) as { features?: PhotonFeature[] };
  return (body.features ?? []).map((f, i) => {
    const p = f.properties;
    const street = p.street ? `${p.street}${p.housenumber ? ` ${p.housenumber}` : ""}` : null;
    const title = p.name ?? street ?? p.city ?? "Luogo";
    const detail = [p.name && street ? street : null, p.district, [p.postcode, p.city].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(" · ");
    const [longitude, latitude] = f.geometry.coordinates;
    return { key: `${p.osm_id ?? i}:${latitude}`, title, detail, latitude, longitude };
  });
}
