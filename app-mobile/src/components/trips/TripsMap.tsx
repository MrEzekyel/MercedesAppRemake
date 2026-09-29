/**
 * Mappa scura dei percorsi: linee colorate per meta, luoghi salvati come
 * simboli nel loro raggio, l'auto dov'e' ora.
 *
 * Da lontano solo simboli: i nomi occuperebbero mezza mappa. Compaiono
 * quando si avvicina lo zoom e c'e' spazio per leggerli.
 */
import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import MapView, { Circle, Marker, Polyline, type Region } from "react-native-maps";
import { colors, radius, spacing } from "../../theme";
import { distanceM } from "../../geo";
import { PLACE_ICON_PATHS } from "../../trips/places";
import type { Place, TripSummary, VehicleState } from "../../types";
import { PathIcon } from "../icons";

/** Sotto questa ampiezza (~3 km di latitudine) i nomi dei luoghi si leggono. */
const NAMES_BELOW_DELTA = 0.03;

export function TripsMap({
  trips, places, placeMap, state, onPlacePress, height = 330, focus,
}: {
  trips: TripSummary[];
  places: Place[];
  placeMap: Map<string, Place>;
  state: VehicleState | null;
  onPlacePress?: (p: Place) => void;
  height?: number;
  /** Luogo al centro della pagina (dettaglio luogo): i suoi percorsi in evidenza. */
  focus?: Place;
}) {
  const lines = trips.filter((t) => t.route.length >= 2);
  const car = state?.latitude != null && state.longitude != null ? { latitude: state.latitude, longitude: state.longitude } : null;
  const points: { latitude: number; longitude: number }[] = [
    ...lines.flatMap((t) => t.route.map(([lon, lat]) => ({ latitude: lat, longitude: lon }))),
    ...(focus ? [focus] : places),
  ];
  if (car && !focus) points.push(car);
  const region = points.length ? fit(points) : null;
  const [showNames, setShowNames] = useState(() => (region ? region.latitudeDelta < NAMES_BELOW_DELTA : false));
  if (!region) return null;

  // Auto parcheggiata dentro un luogo: un piccolo simbolo sul luogo invece
  // di un secondo segnaposto sovrapposto.
  const carPlace = car ? places.find((p) => distanceM(car, p.latitude, p.longitude) <= p.radius_m) ?? null : null;
  const lineColor = (t: TripSummary) => {
    const id = focus ? (t.end_place_id === focus.id ? t.start_place_id : t.end_place_id) : t.end_place_id;
    const place = id ? placeMap.get(id) : null;
    return place ? `${place.color}B3` : "rgba(255,255,255,0.35)";
  };

  return (
    <View style={[styles.wrap, { height }]}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        onRegionChangeComplete={(r: Region) => setShowNames(r.latitudeDelta < NAMES_BELOW_DELTA)}
        userInterfaceStyle="dark"
        mapType="mutedStandard"
        showsPointsOfInterests={false}
        showsBuildings={false}
        pitchEnabled={false}
        toolbarEnabled={false}
      >
        {lines.map((t) => (
          <Polyline
            key={t.id}
            coordinates={t.route.map(([lon, lat]) => ({ latitude: lat, longitude: lon }))}
            strokeColor={lineColor(t)}
            strokeWidth={2}
            lineCap="round"
            lineJoin="round"
          />
        ))}
        {places.map((p) => (
          <Circle
            key={`c${p.id}`}
            center={{ latitude: p.latitude, longitude: p.longitude }}
            radius={p.radius_m}
            strokeColor={p.color}
            fillColor={`${p.color}1F`}
            strokeWidth={1}
          />
        ))}
        {places.map((p) => (
          <Marker
            key={`${p.id}:${showNames ? 1 : 0}`}
            coordinate={{ latitude: p.latitude, longitude: p.longitude }}
            onPress={() => onPlacePress?.(p)}
            // Apple Maps centra la vista sul punto: col nome sotto, la si
            // sposta giu' di mezza etichetta perche' il simbolo resti sul luogo.
            centerOffset={{ x: 0, y: showNames ? 13 : 0 }}
          >
            <View style={styles.pin}>
              <View style={[styles.glyph, { backgroundColor: p.color }]}>
                <PathIcon d={PLACE_ICON_PATHS[p.icon]} size={15} color={colors.background} strokeWidth={2} />
                {p.id === carPlace?.id && (
                  <View style={styles.badge}>
                    <CarThumb heading={state?.heading ?? 0} small />
                  </View>
                )}
              </View>
              {showNames && <Text style={styles.name} numberOfLines={1}>{p.name}</Text>}
            </View>
          </Marker>
        ))}
        {car && !carPlace && !focus && (
          <Marker coordinate={car}>
            <CarThumb heading={state?.heading ?? 0} />
          </Marker>
        )}
      </MapView>
    </View>
  );
}

/** L'auto vista dall'alto (la foto di Info veicolo), ruotata come e' parcheggiata. */
function CarThumb({ heading, small }: { heading: number; small?: boolean }) {
  return (
    <View style={[styles.car, small && styles.carSmall, { transform: [{ rotate: `${heading}deg` }] }]}>
      <Image
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source={require("../../../assets/vehicle/top.jpg")}
        style={small ? styles.carImageSmall : styles.carImage}
      />
    </View>
  );
}

function fit(points: { latitude: number; longitude: number }[]): Region {
  const lats = points.map((p) => p.latitude);
  const lons = points.map((p) => p.longitude);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(0.012, (maxLat - minLat) * 1.4),
    longitudeDelta: Math.max(0.012, (maxLon - minLon) * 1.4),
  };
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: -spacing.md, overflow: "hidden", backgroundColor: colors.backgroundBand },
  pin: { alignItems: "center", gap: 6 },
  glyph: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.background,
  },
  badge: { position: "absolute", right: -9, top: -11 },
  name: {
    maxWidth: 140,
    fontSize: 11,
    fontWeight: "600",
    color: colors.textPrimary,
    backgroundColor: "rgba(6,9,16,0.85)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  car: {
    width: 26,
    height: 48,
    borderRadius: 9,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(79,143,209,0.8)",
  },
  // Ritaglio della foto dall'alto: l'auto occupa il terzo centrale dello scatto.
  carImage: { position: "absolute", left: -26, top: -46, width: 78, height: 140 },
  carSmall: { width: 12, height: 22, borderRadius: 4, borderWidth: 1 },
  carImageSmall: { position: "absolute", left: -12, top: -21, width: 36, height: 64 },
});
