import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { api, ApiError } from "../../src/api";
import { colors, radius, spacing, typography } from "../../src/theme";
import type { TripSummary } from "../../src/types";

export default function ViaggiScreen() {
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      api
        .listTrips()
        .then((rows) => {
          setTrips(rows);
          setError(null);
        })
        .catch((e) => setError(e instanceof ApiError ? e.message : "Backend non raggiungibile"));
    }, [])
  );

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (trips.length === 0) {
    return (
      <View style={styles.centered}>
        <Ionicons name="map-outline" size={40} color={colors.textTertiary} />
        <Text style={styles.emptyText}>Nessun viaggio registrato ancora</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.list}
      data={trips}
      keyExtractor={(t) => t.id}
      renderItem={({ item }) => <TripRow trip={item} />}
    />
  );
}

function TripRow({ trip }: { trip: TripSummary }) {
  const date = new Date(trip.started_at);
  const inCorso = trip.ended_at === null;

  return (
    <Pressable
      onPress={() => router.push(`/trip/${trip.id}`)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowLeft}>
        <Text style={styles.rowDate}>
          {date.toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
        </Text>
        <Text style={styles.rowTime}>
          {date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
        </Text>
      </View>

      <View style={styles.rowCenter}>
        <Text style={styles.rowDistance}>
          {inCorso ? "In corso…" : `${fmt(trip.distance_effective_km)} km`}
        </Text>
        {!inCorso && (
          <Text style={styles.rowMeta}>
            {fmtDuration(trip.duration_s)} · {fmt(trip.l_per_100km)} L/100km
          </Text>
        )}
      </View>

      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Pressable>
  );
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
  list: { padding: spacing.md, gap: spacing.sm },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.lg,
  },
  errorText: { ...typography.body, color: colors.danger, textAlign: "center" },
  emptyText: { ...typography.body, color: colors.textTertiary },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  rowPressed: { opacity: 0.7 },
  rowLeft: { width: 56 },
  rowDate: { ...typography.caption, color: colors.textPrimary, fontWeight: "700" },
  rowTime: { ...typography.caption, color: colors.textTertiary },
  rowCenter: { flex: 1, gap: 2 },
  rowDistance: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  rowMeta: { ...typography.caption, color: colors.textTertiary },
});
