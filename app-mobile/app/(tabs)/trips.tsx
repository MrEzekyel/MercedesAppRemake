import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Dimensions, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, ApiError } from "../../src/api";
import { AppHeader } from "../../src/components/AppHeader";
import { ConsumptionChart } from "../../src/components/ConsumptionChart";
import { ChevronIcon, RouteIcon } from "../../src/components/icons";
import { colors, radius, spacing } from "../../src/theme";
import type { TripSummary } from "../../src/types";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const CHART_W = SCREEN_W - spacing.lg * 2 - spacing.md * 2;
/**
 * Lo scatto e' 1116x2000: riempiendo lo schermo in "cover" il muso finiva
 * fuori dal bordo destro. Qui l'immagine tiene le sue proporzioni a
 * larghezza piena, cosi' si vede intera, e il contenuto parte sotto le
 * ruote (l'auto occupa la fascia 45-63% dell'inquadratura).
 */
const IMAGE_H = Math.round(SCREEN_W * (2000 / 1116));
const SHEET_TOP = Math.round(IMAGE_H * 0.68) - 160;

/**
 * Come le altre schermate: la fotografia riempie lo schermo e resta fissa,
 * il contenuto ci scorre sopra. Prima i consumi in forma di grafico (il
 * dato utile e' la tendenza, non il singolo numero), poi l'elenco.
 */
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

  const closed = trips.filter((t) => t.ended_at !== null);
  const totalKm = sum(closed.map((t) => t.distance_effective_km));
  const totalFuel = sum(closed.map((t) => t.fuel_used_l));
  const avgConsumption = totalKm > 0 && totalFuel > 0 ? (totalFuel / totalKm) * 100 : null;

  return (
    <View style={styles.screen}>
      <Image
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source={require("../../assets/vehicle/side.jpg")}
        style={styles.hero}
        resizeMode="cover"
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppHeader />

        <View style={styles.titleBlock}>
          <Text style={styles.title}>Viaggi</Text>
          <Text style={styles.subtitle}>
            {trips.length > 0 ? `${trips.length} registrati` : "Nessun viaggio ancora"}
          </Text>
        </View>

        {/* Il contenuto sale sopra la foto: la sfumatura evita il taglio netto. */}
        <View style={styles.sheet}>
          <LinearGradient
            colors={["transparent", "rgba(6,9,16,0.75)", colors.background]}
            locations={[0, 0.45, 1]}
            style={styles.sheetFade}
            pointerEvents="none"
          />

          <View style={styles.sheetBody}>
            {error && <Text style={styles.errorText}>{error}</Text>}

            <Text style={styles.sectionLabel}>Consumi</Text>
            <View style={styles.chartCard}>
              <ConsumptionChart trips={trips} width={CHART_W} />
            </View>

            <View style={styles.summaryRow}>
              <Summary value={totalKm > 0 ? fmtKm(totalKm) : "—"} unit="km" label="Percorsi" />
              <View style={styles.hairline} />
              <Summary value={totalFuel > 0 ? totalFuel.toFixed(1) : "—"} unit="l" label="Carburante" />
              <View style={styles.hairline} />
              <Summary
                value={avgConsumption ? avgConsumption.toFixed(1) : "—"}
                unit="l/100"
                label="Media"
              />
            </View>

            <Text style={[styles.sectionLabel, styles.sectionSpaced]}>Storico</Text>

            {trips.length === 0 ? (
              <View style={styles.empty}>
                <RouteIcon size={30} color={colors.textTertiary} strokeWidth={1.2} />
                <Text style={styles.emptyText}>
                  Nessun viaggio registrato: appena l&apos;auto si muove compare qui
                </Text>
              </View>
            ) : (
              trips.map((trip) => <TripRow key={trip.id} trip={trip} />)
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Summary({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <View style={styles.summary}>
      <Text style={styles.summaryValue} numberOfLines={1}>
        {value}
        <Text style={styles.summaryUnit}> {unit}</Text>
      </Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
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
        <Text style={styles.rowDay}>{date.toLocaleDateString("it-IT", { day: "2-digit" })}</Text>
        <Text style={styles.rowMonth}>
          {date.toLocaleDateString("it-IT", { month: "short" }).replace(".", "")}
        </Text>
      </View>

      <View style={styles.rowCenter}>
        <Text style={styles.rowDistance}>
          {inCorso ? "In corso…" : `${fmt(trip.distance_effective_km)} km`}
        </Text>
        <Text style={styles.rowMeta}>
          {date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
          {!inCorso && ` · ${fmtDuration(trip.duration_s)} · ${fmt(trip.l_per_100km)} l/100km`}
        </Text>
      </View>

      <ChevronIcon size={15} color="rgba(255,255,255,0.32)" strokeWidth={1.5} />
    </Pressable>
  );
}

function sum(values: (number | null)[]): number {
  return values.reduce<number>((acc, v) => acc + (v ?? 0), 0);
}

function fmt(value: number | null, decimals = 1): string {
  return value === null ? "—" : value.toFixed(decimals);
}

function fmtKm(value: number): string {
  return Math.round(value).toLocaleString("it-IT");
}

function fmtDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${min % 60}min`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  hero: { position: "absolute", top: 0, left: 0, width: SCREEN_W, height: IMAGE_H },
  /** La tab bar e' trasparente e sovrapposta: il contenuto le lascia spazio. */
  content: { paddingBottom: 110 },

  titleBlock: { alignItems: "center", marginTop: spacing.md },
  title: { fontSize: 24, fontWeight: "600", color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },

  /** Lo spazio vuoto lascia vedere l'auto prima che il contenuto la copra. */
  sheet: { marginTop: SHEET_TOP },
  sheetFade: { position: "absolute", left: 0, right: 0, top: -170, height: 170 },
  sheetBody: { backgroundColor: colors.background, paddingHorizontal: spacing.md, gap: spacing.sm },

  sectionLabel: {
    fontSize: 9.5,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.42)",
  },
  sectionSpaced: { marginTop: spacing.lg },
  chartCard: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },

  summaryRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.sm },
  summary: { flex: 1, alignItems: "center", gap: 6 },
  summaryValue: { fontSize: 21, fontWeight: "600", color: colors.textPrimary, letterSpacing: -0.5 },
  summaryUnit: { fontSize: 11, fontWeight: "500", color: colors.textSecondary, letterSpacing: 0 },
  summaryLabel: {
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.4)",
  },
  hairline: { width: 1, height: 26, backgroundColor: "rgba(255,255,255,0.13)" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm + 4,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  rowPressed: { opacity: 0.55 },
  rowLeft: { width: 34, alignItems: "center" },
  rowDay: { fontSize: 17, fontWeight: "600", color: colors.textPrimary },
  rowMonth: {
    fontSize: 8.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.4)",
  },
  rowCenter: { flex: 1, gap: 3 },
  rowDistance: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  rowMeta: { fontSize: 11.5, color: "rgba(255,255,255,0.45)" },

  empty: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: {
    fontSize: 12.5,
    color: colors.textTertiary,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
    lineHeight: 18,
  },
  errorText: { fontSize: 12, color: colors.danger, textAlign: "center" },
});
