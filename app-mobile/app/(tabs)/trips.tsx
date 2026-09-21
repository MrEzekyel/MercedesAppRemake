import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, ImageBackground, Pressable, StyleSheet, Text, View } from "react-native";
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

  const header = (
    <ImageBackground
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      source={require("../../assets/vehicle/side.jpg")}
      style={styles.hero}
      imageStyle={styles.heroImage}
    >
      <LinearGradient
        colors={["transparent", "rgba(6,9,16,0.55)", colors.background]}
        locations={[0, 0.65, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.headerRow}>
        <Ionicons name="menu-outline" size={20} color={colors.textPrimary} style={{ opacity: 0.85 }} />
        <View style={styles.monogram}>
          <View style={styles.monogramDot} />
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarLabel}>A</Text>
        </View>
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.title}>Viaggi</Text>
        <Text style={styles.subtitle}>
          {trips.length > 0 ? `${trips.length} viaggi registrati` : "Nessun viaggio ancora"}
        </Text>
      </View>
    </ImageBackground>
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
      <View style={styles.screen}>
        {header}
        <View style={styles.emptyBody}>
          <Ionicons name="map-outline" size={40} color={colors.textTertiary} />
          <Text style={styles.emptyText}>Nessun viaggio registrato ancora</Text>
        </View>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.list}
      data={trips}
      keyExtractor={(t) => t.id}
      ListHeaderComponent={header}
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
  list: { paddingBottom: spacing.xl, gap: spacing.sm },
  hero: { width: "100%", height: 400, marginBottom: spacing.md },
  heroImage: { resizeMode: "cover", transform: [{ scale: 1.09 }] },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: spacing.xl + spacing.md,
    paddingHorizontal: spacing.md,
  },
  monogram: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  monogramDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.accent },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLabel: { color: colors.textPrimary, fontSize: 11, fontWeight: "600" },
  titleBlock: { alignItems: "center", marginTop: spacing.md },
  title: { fontSize: 24, fontWeight: "600", color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.lg,
  },
  emptyBody: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  errorText: { ...typography.body, color: colors.danger, textAlign: "center" },
  emptyText: { ...typography.body, color: colors.textTertiary },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginHorizontal: spacing.md,
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
