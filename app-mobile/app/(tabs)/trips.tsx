import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Dimensions, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, ApiError } from "../../src/api";
import { AppHeader } from "../../src/components/AppHeader";
import { ChevronIcon, LeafIcon, RouteIcon } from "../../src/components/icons";
import { RouteSpark } from "../../src/components/RouteSpark";
import { formatEur, resolveFuelPrice, tripCost } from "../../src/fuel";
import { colors, radius, spacing } from "../../src/theme";
import type { Refuel, TripSummary, VehicleState } from "../../src/types";

const { width: SCREEN_W } = Dimensions.get("window");
/**
 * Lo scatto e' 768x1376: tiene le sue proporzioni a larghezza piena, cosi'
 * non viene tagliato, e il contenuto parte sotto l'auto.
 */
const IMAGE_H = Math.round(SCREEN_W * (1376 / 768));
const SHEET_TOP = Math.round(IMAGE_H * 0.72) - 160;

/**
 * Casa dei viaggi: in evidenza l'ultimo, poi la porta verso i consumi, poi
 * la cronologia completa. Ogni riga porta il costo, che e' il motivo per
 * cui si guarda uno storico di viaggi.
 */
export default function ViaggiScreen() {
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [refuels, setRefuels] = useState<Refuel[]>([]);
  const [state, setState] = useState<VehicleState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      Promise.all([api.listTrips(), api.listRefuels(), api.getState()])
        .then(([t, r, s]) => {
          setTrips(t);
          setRefuels(r);
          setState(s[0] ?? null);
          setError(null);
        })
        .catch((e) => setError(e instanceof ApiError ? e.message : "Backend non raggiungibile"));
    }, [])
  );

  const price = resolveFuelPrice(state?.fuel_price_eur_per_l, refuels);
  const closed = trips.filter((t) => t.ended_at !== null);
  const last = closed[0] ?? null;

  return (
    <View style={styles.screen}>
      <Image
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source={require("../../assets/vehicle/trips-hero.webp")}
        style={styles.hero}
        resizeMode="cover"
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppHeader />

        <View style={styles.titleBlock}>
          <Text style={styles.title}>Viaggi</Text>
          <Text style={styles.subtitle}>
            {closed.length > 0 ? `${closed.length} registrati` : "Nessun viaggio ancora"}
          </Text>
        </View>

        <View style={styles.sheet}>
          <LinearGradient
            colors={["transparent", "rgba(11,18,32,0.75)", colors.background]}
            locations={[0, 0.5, 1]}
            style={styles.sheetFade}
            pointerEvents="none"
          />

          <View style={styles.sheetBody}>
            {error && <Text style={styles.errorText}>{error}</Text>}

            {last && (
              <>
                <Text style={styles.sectionLabel}>Ultimo viaggio</Text>
                <Pressable
                  onPress={() => router.push(`/trip/${last.id}`)}
                  style={({ pressed }) => [styles.card, pressed && styles.pressed]}
                >
                  <View style={styles.cardHead}>
                    <RouteSpark route={last.route} width={64} height={30} />
                    <View style={styles.cardHeadText}>
                      <Text style={styles.cardTitle}>{fmtDate(last.started_at)}</Text>
                      <Text style={styles.cardCaption}>{fmtTimeRange(last)}</Text>
                    </View>
                    <ChevronIcon size={15} color="rgba(255,255,255,0.32)" strokeWidth={1.5} />
                  </View>

                  <View style={styles.cardStats}>
                    <MiniStat value={fmt(last.distance_effective_km)} unit="km" label="Distanza" />
                    <View style={styles.hairline} />
                    <MiniStat value={fmtDuration(last.duration_s)} unit="" label="Tempo" />
                    <View style={styles.hairline} />
                    <MiniStat value={fmt(last.l_per_100km)} unit="l/100" label="Consumo" />
                    <View style={styles.hairline} />
                    <MiniStat
                      value={formatEur(tripCost(last, price.value)).replace(" €", "")}
                      unit="€"
                      label="Costo"
                    />
                  </View>
                </Pressable>
              </>
            )}

            <Pressable
              onPress={() => router.push("/consumption")}
              style={({ pressed }) => [styles.link, pressed && styles.pressed]}
            >
              <LeafIcon size={18} color={colors.accent} strokeWidth={1.3} />
              <View style={styles.linkText}>
                <Text style={styles.linkTitle}>Consumi</Text>
                <Text style={styles.linkCaption}>
                  {price.value != null
                    ? `Andamento nel tempo · ${price.value.toFixed(3).replace(".", ",")} €/l ${price.source}`
                    : "Andamento nel tempo e costo al km"}
                </Text>
              </View>
              <ChevronIcon size={15} color="rgba(255,255,255,0.32)" strokeWidth={1.5} />
            </Pressable>

            <Text style={[styles.sectionLabel, styles.sectionSpaced]}>Cronologia</Text>

            {trips.length === 0 ? (
              <View style={styles.empty}>
                <RouteIcon size={30} color={colors.textTertiary} strokeWidth={1.2} />
                <Text style={styles.emptyText}>
                  Nessun viaggio registrato: appena l&apos;auto si muove compare qui
                </Text>
              </View>
            ) : (
              trips.map((trip) => <TripRow key={trip.id} trip={trip} price={price.value} />)
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function MiniStat({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniValue} numberOfLines={1}>
        {value}
        {unit ? <Text style={styles.miniUnit}> {unit}</Text> : null}
      </Text>
      <Text style={styles.miniLabel}>{label}</Text>
    </View>
  );
}

function TripRow({ trip, price }: { trip: TripSummary; price: number | null }) {
  const date = new Date(trip.started_at);
  const inCorso = trip.ended_at === null;
  const cost = tripCost(trip, price);

  return (
    <Pressable
      onPress={() => router.push(`/trip/${trip.id}`)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <RouteSpark route={trip.route} width={40} height={26} />

      <View style={styles.rowCenter}>
        <Text style={styles.rowTitle}>
          {inCorso ? "In corso…" : `${fmt(trip.distance_effective_km)} km`}
        </Text>
        <Text style={styles.rowMeta}>
          {date.toLocaleDateString("it-IT", { day: "numeric", month: "short" })} ·{" "}
          {date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
          {!inCorso && ` · ${fmt(trip.l_per_100km)} l/100km`}
        </Text>
      </View>

      {cost != null && <Text style={styles.rowCost}>{formatEur(cost)}</Text>}
      <ChevronIcon size={15} color="rgba(255,255,255,0.32)" strokeWidth={1.5} />
    </Pressable>
  );
}

function fmt(value: number | null, decimals = 1): string {
  return value === null ? "—" : value.toFixed(decimals);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function fmtTimeRange(trip: TripSummary): string {
  const t = (iso: string) =>
    new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return trip.ended_at ? `${t(trip.started_at)} – ${t(trip.ended_at)}` : t(trip.started_at);
}

function fmtDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${min % 60}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  hero: { position: "absolute", top: 0, left: 0, width: SCREEN_W, height: IMAGE_H },
  content: { paddingBottom: 110 },

  titleBlock: { alignItems: "center", marginTop: spacing.md },
  title: { fontSize: 24, fontWeight: "600", color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },

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
  pressed: { opacity: 0.6 },

  card: {
    borderRadius: radius.lg,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: spacing.md,
    gap: spacing.md,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm + 2 },
  cardHeadText: { flex: 1, gap: 2 },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
    textTransform: "capitalize",
  },
  cardCaption: { fontSize: 11.5, color: "rgba(255,255,255,0.45)" },
  cardStats: { flexDirection: "row", alignItems: "center" },
  miniStat: { flex: 1, alignItems: "center", gap: 5 },
  miniValue: { fontSize: 17, fontWeight: "600", color: colors.textPrimary, letterSpacing: -0.4 },
  miniUnit: { fontSize: 10, fontWeight: "500", color: colors.textSecondary, letterSpacing: 0 },
  miniLabel: {
    fontSize: 8.5,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.4)",
  },
  hairline: { width: 1, height: 24, backgroundColor: "rgba(255,255,255,0.12)" },

  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  linkText: { flex: 1, gap: 2 },
  linkTitle: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  linkCaption: { fontSize: 11.5, color: "rgba(255,255,255,0.45)" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm + 4,
    gap: spacing.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  rowCenter: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  rowMeta: { fontSize: 11.5, color: "rgba(255,255,255,0.45)" },
  rowCost: { fontSize: 13, fontWeight: "600", color: colors.accent },

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
