import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { api, ApiError } from "../../src/api";
import { formatEur, tripCost } from "../../src/fuel";
import { colors, radius, spacing } from "../../src/theme";
import type { Refuel, TripDetail, VehicleState } from "../../src/types";
import { useFuelPrice } from "../../src/useFuelPrice";

/**
 * Un viaggio per intero: dove sei passato, quanto e' durato, quanto ha
 * bevuto e quanto e' costato. La mappa usa il provider di sistema (Apple
 * Maps su iOS): Google Maps richiederebbe una chiave API e una build
 * nativa, che con Expo Go non e' possibile.
 */
export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [refuels, setRefuels] = useState<Refuel[]>([]);
  const [state, setState] = useState<VehicleState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const price = useFuelPrice(state, refuels);

  useEffect(() => {
    if (!id) return;
    Promise.all([api.getTrip(id), api.listRefuels({ limit: 200 }), api.getState()])
      .then(([t, refuelRows, states]: [TripDetail, Refuel[], VehicleState[]]) => {
        setTrip(t);
        setRefuels(refuelRows);
        setState(states[0] ?? null);
        setError(null);
      })
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
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const coords = trip.route.map(([longitude, latitude]) => ({ latitude, longitude }));
  const cost = tripCost(trip, price.value);
  const perKm = cost != null && trip.distance_effective_km ? cost / trip.distance_effective_km : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {coords.length >= 2 ? (
        <View style={styles.mapFrame}>
          <MapView
            style={styles.map}
            initialRegion={regionFromCoords(coords)}
            scrollEnabled={false}
            zoomEnabled={false}
            userInterfaceStyle="dark"
          >
            <Polyline coordinates={coords} strokeColor={colors.accent} strokeWidth={4} />
            <Marker coordinate={coords[0]} title="Partenza" pinColor="#ffffff" />
            <Marker coordinate={coords[coords.length - 1]} title="Arrivo" pinColor={colors.accent} />
          </MapView>
        </View>
      ) : (
        <View style={styles.noMap}>
          <Text style={styles.noMapText}>
            Nessun tracciato GPS per questo viaggio: l&apos;auto non ha inviato posizioni mentre era
            in movimento
          </Text>
        </View>
      )}

      <Text style={styles.date}>{fmtDate(trip.started_at)}</Text>
      <Text style={styles.time}>{fmtTimeRange(trip)}</Text>

      {/* Costo in evidenza: e' il dato che non si trova altrove */}
      <View style={styles.costCard}>
        <View>
          <Text style={styles.costValue}>{formatEur(cost)}</Text>
          <Text style={styles.costLabel}>Costo del viaggio</Text>
        </View>
        <View style={styles.costSide}>
          <Text style={styles.costSideValue}>
            {perKm != null ? `${perKm.toFixed(2).replace(".", ",")} €` : "—"}
          </Text>
          <Text style={styles.costLabel}>al km</Text>
        </View>
      </View>

      {price.value == null && (
        <Text style={styles.hint}>
          Imposta il prezzo al litro in Viaggi › Consumi per vedere il costo
        </Text>
      )}

      <Text style={styles.sectionLabel}>Percorso</Text>
      <View style={styles.grid}>
        <Cell value={fmt(trip.distance_effective_km)} unit="km" label="Distanza" />
        <Cell value={fmtDuration(trip.duration_s)} unit="" label="Tempo" />
        <Cell value={fmt(trip.avg_speed_kmh, 0)} unit="km/h" label="Vel. media" />
      </View>

      <Text style={[styles.sectionLabel, styles.sectionSpaced]}>Carburante</Text>
      <View style={styles.grid}>
        <Cell value={fmt(trip.l_per_100km)} unit="l/100" label="Consumo" />
        <Cell value={fmt(trip.fuel_used_l)} unit="l" label="Usati" />
        <Cell value={fmt(trip.km_per_l)} unit="km/l" label="Resa" />
      </View>

      {trip.distance_gps_km != null && trip.distance_km != null && (
        <>
          <Text style={[styles.sectionLabel, styles.sectionSpaced]}>Misure grezze</Text>
          <View style={styles.rawRow}>
            <Text style={styles.rawLabel}>Contachilometri</Text>
            <Text style={styles.rawValue}>{fmt(trip.distance_km)} km</Text>
          </View>
          <View style={styles.rawRow}>
            <Text style={styles.rawLabel}>Traccia GPS</Text>
            <Text style={styles.rawValue}>{fmt(trip.distance_gps_km)} km</Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Cell({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellValue} numberOfLines={1}>
        {value}
        {unit ? <Text style={styles.cellUnit}> {unit}</Text> : null}
      </Text>
      <Text style={styles.cellLabel}>{label}</Text>
    </View>
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
    // Margine del 40% attorno al percorso, con un minimo per i viaggi corti.
    latitudeDelta: Math.max((maxLat - minLat) * 1.4, 0.01),
    longitudeDelta: Math.max((maxLon - minLon) * 1.4, 0.01),
  };
}

function fmt(value: number | null, decimals = 1): string {
  return value === null ? "—" : value.toFixed(decimals).replace(".", ",");
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function fmtTimeRange(trip: TripDetail): string {
  const t = (iso: string) =>
    new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return trip.ended_at ? `${t(trip.started_at)} – ${t(trip.ended_at)}` : `${t(trip.started_at)} · in corso`;
}

function fmtDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${min % 60}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl * 2 },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  errorText: { fontSize: 14, color: colors.danger, textAlign: "center" },

  mapFrame: {
    height: 240,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  map: { flex: 1 },
  noMap: {
    height: 120,
    borderRadius: radius.lg,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  noMapText: { fontSize: 12.5, color: colors.textTertiary, textAlign: "center", lineHeight: 18 },

  date: {
    fontSize: 19,
    fontWeight: "600",
    color: colors.textPrimary,
    textTransform: "capitalize",
    marginTop: spacing.lg,
  },
  time: { fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 3 },

  costCard: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: "rgba(79,143,209,0.35)",
  },
  costValue: { fontSize: 30, fontWeight: "600", color: colors.textPrimary, letterSpacing: -0.8 },
  costSide: { alignItems: "flex-end" },
  costSideValue: { fontSize: 17, fontWeight: "600", color: colors.accent },
  costLabel: {
    fontSize: 9.5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.5)",
    marginTop: 4,
  },
  hint: {
    fontSize: 11.5,
    color: "rgba(255,255,255,0.45)",
    marginTop: spacing.sm,
    textAlign: "center",
  },

  sectionLabel: {
    fontSize: 9.5,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.42)",
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  sectionSpaced: {},

  grid: { flexDirection: "row", alignItems: "center" },
  cell: { flex: 1, alignItems: "center", gap: 6 },
  cellValue: { fontSize: 20, fontWeight: "600", color: colors.textPrimary, letterSpacing: -0.5 },
  cellUnit: { fontSize: 11, fontWeight: "500", color: colors.textSecondary, letterSpacing: 0 },
  cellLabel: {
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.4)",
  },

  rawRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  rawLabel: { fontSize: 13.5, color: colors.textPrimary },
  rawValue: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
});
