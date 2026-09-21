import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import MapView, { Polyline } from "react-native-maps";
import { api, ApiError } from "../../src/api";
import {
  ClockIcon,
  FuelIcon,
  LeafIcon,
  OdometerIcon,
  RangeIcon,
  RouteIcon,
} from "../../src/components/icons";
import { StatTile } from "../../src/components/StatTile";
import { colors, radius, spacing, typography } from "../../src/theme";
import type { TripDetail } from "../../src/types";

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getTrip(id)
      .then(setTrip)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Backend non raggiungibile"));
  }, [id]);

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.textSecondary} />
      </View>
    );
  }

  // GeoJSON e' [lon, lat]; react-native-maps vuole { latitude, longitude }.
  const coords = trip.route.map(([lon, lat]) => ({ latitude: lat, longitude: lon }));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {coords.length > 1 && (
        <MapView
          style={styles.map}
          initialRegion={regionFromCoords(coords)}
          scrollEnabled={false}
          zoomEnabled={false}
        >
          <Polyline coordinates={coords} strokeColor={colors.accent} strokeWidth={4} />
        </MapView>
      )}

      <View style={styles.statsGrid}>
        <StatTile Icon={RangeIcon} label="Distanza" value={fmt(trip.distance_effective_km)} unit=" km" />
        <StatTile Icon={ClockIcon} label="Durata" value={fmtDuration(trip.duration_s)} />
        <StatTile Icon={OdometerIcon} label="Vel. media" value={fmt(trip.avg_speed_kmh, 0)} unit=" km/h" />
      </View>
      <View style={styles.statsGrid}>
        <StatTile Icon={LeafIcon} label="Consumo" value={fmt(trip.l_per_100km)} unit=" l/100" />
        <StatTile Icon={FuelIcon} label="Litri usati" value={fmt(trip.fuel_used_l)} unit=" l" />
        <StatTile Icon={RouteIcon} label="Km/litro" value={fmt(trip.km_per_l)} />
      </View>
    </ScrollView>
  );
}

function regionFromCoords(coords: { latitude: number; longitude: number }[]) {
  const lats = coords.map((c) => c.latitude);
  const lons = coords.map((c) => c.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    // Un margine del 40% cosi' la traccia non tocca i bordi della card.
    latitudeDelta: Math.max((maxLat - minLat) * 1.4, 0.01),
    longitudeDelta: Math.max((maxLon - minLon) * 1.4, 0.01),
  };
}

function fmt(value: number | null, decimals = 1): string {
  return value === null ? "—" : value.toFixed(decimals);
}

function fmtDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${min % 60}min`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md },
  centered: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  errorText: { ...typography.body, color: colors.danger, padding: spacing.lg, textAlign: "center" },
  map: { width: "100%", height: 220, borderRadius: radius.md, overflow: "hidden" },
  statsGrid: { flexDirection: "row", gap: spacing.sm },
});
