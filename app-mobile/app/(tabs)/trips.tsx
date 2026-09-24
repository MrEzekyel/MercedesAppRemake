import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Dimensions, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppHeader } from "../../src/components/AppHeader";
import { useCarTransition } from "../../src/components/CarTransition";
import { CompareIcon, FuelIcon, PinIcon, TrophyIcon } from "../../src/components/icons";
import { Bars } from "../../src/components/trips/charts";
import { TripRow } from "../../src/components/trips/TripRow";
import {
  BigFigure, Chips, DeltaPill, EmptyNote, Eyebrow, Insight, NavRow, PeriodNav, Segmented, StatGrid, type SegmentOption,
} from "../../src/components/trips/ui";
import { VehicleGreeting } from "../../src/components/VehicleGreeting";
import { colors, radius, spacing } from "../../src/theme";
import { useAddresses, useBasics, useTrips } from "../../src/trips/data";
import * as f from "../../src/trips/format";
import { bucketsFor, periodFor, previousRange, type Period, type PeriodKind } from "../../src/trips/period";
import { endpoint } from "../../src/trips/places";
import { closedTrips, delta, insight, type Metric, series, totals } from "../../src/trips/stats";
import type { TripSummary } from "../../src/types";
import { useSwipeNav } from "../../src/useSwipeNav";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
/**
 * Foto a tutto schermo con lo stesso zoom della Home: e' l'ultimo
 * fotogramma del video di transizione, quindi il passaggio video -> foto
 * non ha scatti. L'auto e' gia' inquadrata in alto nello scatto stesso.
 */
const HERO_ZOOM = 1.09;
/** Dove comincia il resoconto, che copre il fondo della foto. */
const SHEET_TOP = Math.round(SCREEN_W * (1928 / 1076) * 0.72) - 160;
const CHART_W = SCREEN_W - spacing.md * 2;
/** Viaggi mostrati prima di "Tutti i viaggi". */
const FIRST_TRIPS = 6;

const KINDS: SegmentOption<PeriodKind>[] = [
  { key: "week", label: "Settimana" },
  { key: "month", label: "Mese" },
  { key: "year", label: "Anno" },
  { key: "all", label: "Tutto" },
];

const METRICS: SegmentOption<Metric>[] = [
  { key: "km", label: "Km" },
  { key: "trips", label: "Viaggi" },
  { key: "time", label: "Tempo" },
  { key: "cost", label: "Costo" },
];

const ALL_SINCE = new Date(2000, 0, 1);

/**
 * Resoconto viaggi: quanto hai guidato e quanto ti e' costato nel periodo
 * scelto, un grafico, una frase che dice qualcosa, gli ingressi alle
 * analisi e i viaggi raggruppati per giorno. Ogni numero porta a cio' che
 * lo compone.
 */
export default function ViaggiScreen() {
  const { play, contentOpacity, vehicleState, reportVehicleState } = useCarTransition();
  const scrollRef = useRef<ScrollView>(null);
  const [kind, setKind] = useState<PeriodKind>("month");
  const [offset, setOffset] = useState(0);
  const [metric, setMetric] = useState<Metric>("km");
  const [expanded, setExpanded] = useState(false);

  const basics = useBasics();
  const price = basics.price.value;

  // "Tutto" parte dal primo viaggio, che si conosce solo dopo averli scaricati.
  const base = useMemo(() => periodFor(kind, offset), [kind, offset]);
  const { trips, error } = useTrips(kind === "all" ? { start: ALL_SINCE, end: base.end } : base);
  const firstTripAt = useMemo(() => {
    const last = trips[trips.length - 1];
    return last ? new Date(last.started_at) : undefined;
  }, [trips]);
  const period: Period = useMemo(
    () => (kind === "all" ? periodFor("all", 0, new Date(), firstTripAt) : base),
    [kind, base, firstTripAt]
  );
  const prevRange = useMemo(() => previousRange(period), [period]);
  const prev = useTrips(prevRange);

  useFocusEffect(
    useCallback(() => {
      // Uscendo si torna in cima: al ritorno header e saluto devono stare
      // dove li ridisegna il video di transizione, non scrollati via.
      return () => scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, [])
  );
  useEffect(() => reportVehicleState(basics.state), [basics.state, reportVehicleState]);
  useEffect(() => setExpanded(false), [kind, offset]);

  const cur = totals(trips, price);
  const before = prevRange ? totals(prev.trips, price) : null;
  const buckets = useMemo(() => bucketsFor(period), [period]);
  const values = series(trips, buckets, metric, price);
  const past = values.filter((v): v is number => v != null);
  const mean = past.length ? past.reduce((a, b) => a + b, 0) / past.length : 0;
  const peak = past.length ? values.indexOf(Math.max(...past)) : -1;
  const note = insight(trips, prev.trips, period.previousName);
  const closed = closedTrips(trips);
  const addresses = useAddresses(closed, basics.placeMap);
  const shown = expanded ? closed : closed.slice(0, FIRST_TRIPS);

  const swipe = useSwipeNav({
    onSwipeLeft: () => play("trips", "info", () => router.replace("/vehicle-info")),
    onSwipeRight: () => play("trips", "home", () => router.replace("/")),
  });

  const d = (a: number | null, b: number | null | undefined) => (b == null ? null : delta(a, b));
  const kmDelta = d(cur.km, before?.km);
  const consDelta = d(cur.lPer100, before?.lPer100);

  return (
    <View style={styles.screen}>
      <Image
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source={require("../../assets/vehicle/trips.jpg")}
        style={styles.hero}
        resizeMode="cover"
      />

      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} {...swipe}>
        {/* Header e saluto identici in tutte le schermate: restano fermi
            anche durante il video di transizione, non sfumano mai. */}
        <AppHeader />
        <VehicleGreeting state={vehicleState} />

        <Animated.View style={[styles.sheet, { opacity: contentOpacity }]}>
          <LinearGradient
            colors={["transparent", "rgba(6,9,16,0.86)", colors.background]}
            locations={[0, 0.7, 1]}
            style={styles.sheetFade}
            pointerEvents="none"
          />

          <View style={styles.body}>
            <View style={styles.periodBlock}>
              <Segmented options={KINDS} value={kind} onChange={(k) => { setKind(k); setOffset(0); }} />
              {kind !== "all" ? (
                <PeriodNav
                  caption={period.caption}
                  onPrev={() => setOffset((o) => o - 1)}
                  onNext={() => setOffset((o) => Math.min(0, o + 1))}
                  canNext={offset < 0}
                />
              ) : (
                <Text style={styles.allCaption}>{period.caption}</Text>
              )}
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            <View style={styles.hero2}>
              <BigFigure value={f.km(cur.km)} unit="km" />
              {kmDelta != null && period.previousName ? (
                <DeltaPill text={`${f.pct(kmDelta)} rispetto a ${period.previousName}`} />
              ) : null}
              <Text style={styles.sentence}>{sentence(period, cur)}</Text>
            </View>

            <StatGrid
              cells={[
                {
                  label: "TEMPO ALLA GUIDA",
                  value: f.duration(cur.seconds),
                  sub: [pctOrNull(d(cur.seconds, before?.seconds)), cur.trips ? `${f.duration(cur.seconds / cur.trips)} a viaggio` : null]
                    .filter(Boolean).join(" · "),
                },
                {
                  label: "VIAGGI",
                  value: String(cur.trips),
                  sub: [pctOrNull(d(cur.trips, before?.trips)), cur.trips ? `${f.km(cur.km / cur.trips)} km di media` : null]
                    .filter(Boolean).join(" · "),
                },
                {
                  label: "CARBURANTE",
                  value: f.eur(cur.cost),
                  sub: [pctOrNull(d(cur.cost, before?.cost)), cur.costPerKm != null ? `${f.num(cur.costPerKm, 3)} €/km` : null]
                    .filter(Boolean).join(" · ") || "prezzo al litro mancante",
                  onPress: () => router.push("/consumption"),
                },
                {
                  label: "CONSUMO MEDIO",
                  value: f.num(cur.lPer100),
                  unit: "L/100 km",
                  sub: consDelta == null ? undefined : `${f.pct(consDelta)} · ${consWord(consDelta)} ${period.previousName}`,
                  subTone: consDelta == null || Math.abs(consDelta) < 0.03 ? "neutral" : consDelta < 0 ? "good" : "warn",
                  onPress: () => router.push("/consumption"),
                },
              ]}
            />

            <View style={styles.chartBlock}>
              <Chips options={METRICS} value={metric} onChange={setMetric} />
              <View style={styles.chartHead}>
                <Text style={styles.chartCaption}>{metricCaption(metric, period)}</Text>
                <Text style={styles.chartAvg}>media {metricValue(metric, mean)}</Text>
              </View>
              <Bars values={values} width={CHART_W} highlight={peak} labels={axisLabels(buckets.map((b) => b.label), period)} />
            </View>

            {note && <Insight text={note} onPress={() => router.push("/consumption")} />}

            <View>
              <NavRow
                icon={<FuelIcon size={20} color={colors.accent} strokeWidth={1.5} />}
                title="Consumi e costi"
                caption={basics.price.value != null ? `${f.num(basics.price.value, 3)} €/L` : undefined}
                onPress={() => router.push("/consumption")}
              />
              <NavRow
                icon={<PinIcon size={20} color={colors.accent} strokeWidth={1.5} />}
                title="Abitudini e luoghi"
                caption={basics.places.length ? `${basics.places.length} ${basics.places.length === 1 ? "luogo" : "luoghi"}` : "Salva i tuoi luoghi"}
                onPress={() => router.push("/habits")}
              />
              <NavRow
                icon={<TrophyIcon size={20} color={colors.accent} strokeWidth={1.5} />}
                title="Record"
                onPress={() => router.push("/records")}
              />
              <NavRow
                icon={<CompareIcon size={20} color={colors.accent} strokeWidth={1.5} />}
                title="Confronta periodi"
                onPress={() => router.push("/compare")}
                last
              />
            </View>

            <View>
              {closed.length === 0 ? (
                <EmptyNote text={"Nessun viaggio in questo periodo.\nI viaggi si registrano da soli a ogni accensione."} />
              ) : (
                groupByDay(shown).map(([day, list]) => (
                  <View key={day.toISOString()} style={styles.day}>
                    <Eyebrow style={styles.dayHeader}>{f.dayHeader(day)}</Eyebrow>
                    {list.map((t) => (
                      <TripRow
                        key={t.id}
                        trip={t}
                        from={endpoint(t, "start", basics.placeMap, addresses)}
                        to={endpoint(t, "end", basics.placeMap, addresses)}
                        cost={price != null && t.fuel_used_l != null ? t.fuel_used_l * price : null}
                        onPress={() => router.push(`/trip/${t.id}`)}
                      />
                    ))}
                  </View>
                ))
              )}
              {closed.length > FIRST_TRIPS && !expanded && (
                <Pressable onPress={() => setExpanded(true)} style={({ pressed }) => [styles.more, pressed && styles.pressed]}>
                  <Text style={styles.moreText}>Tutti i {closed.length} viaggi</Text>
                </Pressable>
              )}
            </View>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const pctOrNull = (v: number | null) => (v == null ? null : f.pct(v));

/** Sotto il 3% la differenza di consumo e' rumore, non un giudizio. */
const consWord = (d: number) => (Math.abs(d) < 0.03 ? "in linea con" : d < 0 ? "meglio di" : "peggio di");

/** "A settembre hai fatto 42 viaggi e passato 18 ore alla guida, spendendo 69,80 € di carburante." */
function sentence(p: Period, t: ReturnType<typeof totals>): string {
  if (t.trips === 0) return "Nessun viaggio registrato in questo periodo.";
  let when: string;
  if (p.kind === "month") {
    const m = p.label.split(" ")[0].toLowerCase();
    when = `${/^[aeiou]/.test(m) ? "Ad" : "A"} ${m}`;
  } else if (p.kind === "week") when = p.offset === 0 ? "Questa settimana" : p.offset === -1 ? "La settimana scorsa" : `Dal ${p.label}`;
  else if (p.kind === "year") when = `Nel ${p.label}`;
  else when = "Da quando registri i viaggi";
  const hours = t.seconds / 3600;
  const time = hours >= 1 ? `${Math.round(hours)} ${Math.round(hours) === 1 ? "ora" : "ore"}` : `${Math.round(t.seconds / 60)} minuti`;
  const trips = `${t.trips} ${t.trips === 1 ? "viaggio" : "viaggi"}`;
  const spend = t.cost != null ? `, spendendo ${f.eur(t.cost)} di carburante` : "";
  return `${when} hai fatto ${trips} e passato ${time} alla guida${spend}.`;
}

function metricCaption(m: Metric, p: Period): string {
  const per = p.kind === "week" || p.kind === "month" ? "al giorno" : "al mese";
  return { km: `Km ${per}`, trips: `Viaggi ${per}`, time: `Minuti alla guida ${per}`, cost: `Carburante ${per}` }[m];
}

function metricValue(m: Metric, v: number): string {
  if (m === "km") return `${f.km(v)} km`;
  if (m === "trips") return f.num(v);
  if (m === "time") return f.duration(v * 60);
  return f.eur(v);
}

/** Poche etichette sotto il grafico: tutte per settimana e anno, cinque per il mese. */
function axisLabels(labels: string[], p: Period): string[] {
  if (p.kind === "week" || labels.length <= 12) return labels;
  const n = labels.length;
  return [0, 7, 14, 21, n - 1].filter((i) => i < n).map((i) => labels[i]);
}

function groupByDay(trips: TripSummary[]): [Date, TripSummary[]][] {
  const out: [Date, TripSummary[]][] = [];
  for (const t of trips) {
    const d = new Date(t.started_at);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const last = out[out.length - 1];
    if (last && last[0].getTime() === day.getTime()) last[1].push(t);
    else out.push([day, [t]]);
  }
  return out;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  hero: {
    position: "absolute",
    top: 0,
    left: 0,
    width: SCREEN_W,
    height: SCREEN_H,
    transform: [{ scale: HERO_ZOOM }],
  },
  content: { paddingBottom: 120 },
  pressed: { opacity: 0.6 },

  sheet: { marginTop: SHEET_TOP },
  sheetFade: { position: "absolute", left: 0, right: 0, top: -150, height: 150 },
  body: { backgroundColor: colors.background, paddingHorizontal: spacing.md, gap: 26 },

  periodBlock: { gap: 8 },
  allCaption: { textAlign: "center", fontSize: 12, fontWeight: "600", letterSpacing: 1.6, color: colors.textSecondary, paddingVertical: 14 },
  error: { fontSize: 12, color: colors.danger, textAlign: "center" },

  hero2: { alignItems: "center", gap: 8, marginTop: -8 },
  sentence: { marginTop: 4, marginHorizontal: 12, textAlign: "center", fontSize: 15, lineHeight: 22, color: colors.textSecondary },

  chartBlock: { gap: 14 },
  chartHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  chartCaption: { fontSize: 13, color: colors.textSecondary },
  chartAvg: { fontSize: 13, color: colors.textTertiary },

  day: { paddingTop: 8 },
  dayHeader: { paddingBottom: 4, paddingTop: 6 },
  more: {
    marginTop: 12,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  moreText: { fontSize: 14, fontWeight: "500", color: colors.textPrimary },
});
