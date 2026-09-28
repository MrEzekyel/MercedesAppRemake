import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api, ApiError } from "../src/api";
import { ColumnBars, LineChart, RangeBar, Scatter } from "../src/components/trips/charts";
import { CONTENT_W, SubPage } from "../src/components/trips/SubPage";
import {
  BigFigure, Chips, EmptyNote, Eyebrow, GOOD, HAIRLINE_SOFT, PeriodPicker, SectionHeader, Segmented, StatGrid, WARN,
} from "../src/components/trips/ui";
import { colors, radius } from "../src/theme";
import { useBasics, usePeriodTrips } from "../src/trips/data";
import * as f from "../src/trips/format";
import { axisLabelsFor, bucketsFor, monthShort, perBucket, type PeriodKind } from "../src/trips/period";
import { describeTrip } from "../src/trips/places";
import { closedTrips, consumptionSeries, delta, distanceBuckets, refuelRows, totals } from "../src/trips/stats";

const KINDS: PeriodKind[] = ["day", "week", "month", "year", "all"];
type Span = "30" | "50" | "100" | "all";
const SPANS: { key: Span; label: string }[] = [
  { key: "30", label: "30" },
  { key: "50", label: "50" },
  { key: "100", label: "100" },
  { key: "all", label: "Tutto" },
];

/**
 * Consumi e costi: quanto beve l'auto, perche' (viaggi brevi, giorni
 * peggiori), quanto costa e quanto hai pagato la benzina. Il prezzo al
 * litro e' l'unico dato che l'auto non sa: sta in fondo, modificabile.
 */
export default function ConsumiScreen() {
  const [kind, setKind] = useState<PeriodKind>("month");
  const [offset, setOffset] = useState(0);
  const [unit, setUnit] = useState<"l100" | "kml">("l100");
  // I viaggi lunghi sono rari: di serie il grafico si ferma a 30 km, dove
  // stanno quasi tutti i punti, invece di schiacciarli a sinistra.
  const [span, setSpan] = useState<Span>("30");
  const { period, trips, prevTrips, prevRange } = usePeriodTrips(kind, offset);
  const basics = useBasics();
  const price = basics.price;

  const cur = totals(trips, price.value);
  const before = totals(prevTrips, price.value);
  const consDelta = prevRange ? delta(cur.lPer100, before.lPer100) : null;

  const withCons = closedTrips(trips).filter((t) => t.l_per_100km != null && t.l_per_100km > 0);
  const efficient = withCons.filter((t) => (t.distance_effective_km ?? 0) >= 3);
  const best = efficient.length ? efficient.reduce((a, b) => ((b.l_per_100km ?? 99) < (a.l_per_100km ?? 99) ? b : a)) : null;
  // Sotto il chilometro il consumo e' rumore (0,1 km a "50 L/100"): non fa testo.
  const measurable = withCons.filter((t) => (t.distance_effective_km ?? 0) >= 1);
  const worst = measurable.length ? measurable.reduce((a, b) => ((b.l_per_100km ?? 0) > (a.l_per_100km ?? 0) ? b : a)) : null;

  const buckets = useMemo(() => bucketsFor(period), [period]);
  const daily = consumptionSeries(trips, buckets);
  const dailyValues = daily.filter((v): v is number => v != null);
  const consValues = withCons.filter((t) => (t.distance_effective_km ?? 0) >= 1).map((t) => t.l_per_100km as number);
  const short = distanceBuckets(trips)[0];
  const longest = Math.max(...withCons.map((t) => t.distance_effective_km ?? 0), 0);
  const xMax = span === "all" ? Math.max(30, Math.ceil(longest / 10) * 10) : Number(span);

  const days = Math.max(1, (period.end.getTime() - period.start.getTime()) / 86400000);
  const allRows = refuelRows(basics.refuels, price.value);
  const rows = allRows.filter((r) => {
    const d = new Date(r.refuel.detected_at);
    return d >= period.start && d < period.end;
  });
  const months = spendByMonth(allRows);

  const [zone, setZone] = useState<number | null>(null);
  useEffect(() => {
    if (!basics.state?.vin) return;
    api.getFuelPriceAverage(basics.state.vin).then((a) => setZone(a.price)).catch(() => setZone(null));
  }, [basics.state?.vin]);
  const paid = paidPrice(allRows);
  const vsZone = paid != null && zone != null ? (paid - zone) * 100 : null;

  const shown = (v: number | null) => (v == null ? "—" : unit === "l100" ? f.num(v) : f.num(100 / v));

  return (
    <SubPage title="Consumi e costi">
      <PeriodPicker kinds={KINDS} kind={kind} offset={offset} caption={period.caption} onKind={setKind} onOffset={setOffset} />

      <View style={styles.center}>
        <Segmented
          small
          options={[{ key: "l100", label: "L/100 km" }, { key: "kml", label: "km/L" }]}
          value={unit}
          onChange={setUnit}
        />
        <BigFigure value={shown(cur.lPer100)} unit={unit === "l100" ? "L/100 km" : "km/L"} size={72} />
        {consDelta != null ? (
          <Text style={[styles.delta, { color: Math.abs(consDelta) < 0.03 ? colors.textSecondary : consDelta < 0 ? GOOD : WARN }]}>
            {f.pct(consDelta)} rispetto a {period.previousName}
            {cur.lPer100 != null ? ` · ${unit === "l100" ? `${f.num(100 / cur.lPer100)} km/L` : `${f.num(cur.lPer100)} L/100 km`}` : ""}
          </Text>
        ) : null}
      </View>

      {cur.lPer100 != null && (
        <View style={styles.rangeBlock}>
          <RangeBar value={cur.lPer100} />
          {best && worst && (
            <View style={styles.rangeRow}>
              <Pressable onPress={() => router.push(`/trip/${best.id}`)} style={styles.rangeSide}>
                <Eyebrow>MIGLIORE</Eyebrow>
                <Text style={styles.rangeValue}>{shown(best.l_per_100km)}</Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {describeTrip(best, basics.placeMap)} · {f.km(best.distance_effective_km)} km
                </Text>
              </Pressable>
              <Pressable onPress={() => router.push(`/trip/${worst.id}`)} style={[styles.rangeSide, styles.right]}>
                <Eyebrow>PEGGIORE</Eyebrow>
                <Text style={styles.rangeValue}>{shown(worst.l_per_100km)}</Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {f.shortDate(worst.started_at)} · {f.km(worst.distance_effective_km)} km
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      <View style={styles.block}>
        <SectionHeader
          title={`Consumo ${perBucket(period.kind)}`}
          right={cur.lPer100 != null ? `- - media ${f.num(cur.lPer100)}` : undefined}
        />
        {dailyValues.length > 0 ? (
          <LineChart
            values={daily}
            axisLabels={axisLabelsFor(buckets, period.kind)}
            width={CONTENT_W}
            min={Math.min(4, Math.floor(Math.min(...dailyValues)))}
            max={Math.max(10, Math.ceil(Math.max(...dailyValues)))}
            avg={cur.lPer100}
          />
        ) : (
          <EmptyNote text="Nessun consumo registrato in questo periodo." />
        )}
      </View>

      {withCons.length >= 3 && (
        <View style={styles.block}>
          <View style={styles.headRow}>
            <SectionHeader title="Distanza e consumo" />
            <Chips options={SPANS} value={span} onChange={setSpan} small />
          </View>
          <Text style={styles.explain}>
            Ogni punto è un viaggio. A sinistra i tragitti brevi, a motore ancora freddo: consumano di più.
          </Text>
          <Scatter
            points={measurable.map((t) => ({ x: t.distance_effective_km ?? 0, y: t.l_per_100km as number }))}
            width={CONTENT_W}
            xMax={xMax}
            yMin={Math.min(4, Math.floor(Math.min(...consValues)))}
            yMax={Math.max(10, Math.ceil(Math.max(...consValues)))}
            avg={cur.lPer100}
            shadeBelowX={5}
            shadeLabel={short.lPer100 != null ? `sotto i 5 km · ${f.num(short.lPer100)}` : undefined}
          />
          {span !== "all" && withCons.some((t) => (t.distance_effective_km ?? 0) > xMax) && (
            <Text style={styles.muted}>
              {withCons.filter((t) => (t.distance_effective_km ?? 0) > xMax).length} viaggi oltre {xMax} km non mostrati
            </Text>
          )}
        </View>
      )}

      <StatGrid
        columns={3}
        cells={[
          { label: "LITRI", value: f.num(cur.liters), sub: `${f.num(cur.liters / days)} L al giorno` },
          {
            label: "COSTO AL KM",
            value: cur.costPerKm != null ? `${f.num(cur.costPerKm, 3)} €` : "—",
            sub: cur.cost != null && cur.trips ? `${f.eur(cur.cost / cur.trips)} a viaggio` : undefined,
          },
          {
            label: "PREZZO PAGATO",
            value: paid != null ? `${f.num(paid, 3)} €` : "—",
            sub: vsZone == null ? undefined : `${f.num(Math.abs(vsZone), 1)} cent ${vsZone <= 0 ? "sotto" : "sopra"} la zona`,
            subTone: vsZone == null ? "neutral" : vsZone <= 0 ? "good" : "warn",
          },
        ]}
      />

      {months.some((m) => m.value > 0) && (
        <View style={styles.block}>
          <SectionHeader title="Spesa carburante" right={`ultimi 6 mesi · ${f.eur(months.reduce((a, m) => a + m.value, 0), 0)}`} />
          <ColumnBars items={months} />
        </View>
      )}

      <View>
        <SectionHeader title="Rifornimenti" right="Tutti" onRight={() => router.push("/refuels")} />
        {rows.length === 0 ? (
          <EmptyNote text="Nessun rifornimento in questo periodo." />
        ) : (
          rows.slice(0, 6).map((r, i) => {
            const d = new Date(r.refuel.detected_at);
            const pending = r.refuel.status === "pending";
            return (
              <Pressable
                key={r.refuel.id}
                onPress={() => router.push(`/refuel/${r.refuel.id}`)}
                style={({ pressed }) => [styles.refuel, i > 0 && styles.refuelLine, pressed && styles.pressed]}
              >
                <View style={styles.refuelDate}>
                  <Text style={styles.refuelDay}>{d.getDate()}</Text>
                  <Eyebrow>{monthShort(d).toUpperCase()}</Eyebrow>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.refuelTitle}>
                    {pending ? "Da confermare" : r.refuel.full_tank ? "Pieno" : "Rabbocco"}
                  </Text>
                  <Text style={styles.refuelMeta}>
                    {[
                      r.liters != null ? `${f.num(r.liters)} L` : null,
                      r.pricePerLiter != null ? `${f.num(r.pricePerLiter, 3)} €/L` : null,
                      r.kmSince != null ? `${f.num(r.kmSince, 0)} km dal precedente` : null,
                    ].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                <View style={styles.refuelRight}>
                  <Text style={[styles.refuelTotal, pending && { color: WARN }]}>{f.eur(r.total)}</Text>
                  {r.lPer100 != null && <Text style={styles.muted}>{f.num(r.lPer100)} L/100</Text>}
                </View>
              </Pressable>
            );
          })
        )}
      </View>

      <PriceEditor basics={basics} />
    </SubPage>
  );
}

/** Media dei prezzi pagati nei rifornimenti confermati, pesata sui litri. */
function paidPrice(rows: ReturnType<typeof refuelRows>): number | null {
  let liters = 0, cost = 0;
  for (const r of rows) {
    if (r.refuel.status !== "confirmed" || r.liters == null || r.refuel.price_per_liter == null) continue;
    liters += r.liters;
    cost += r.liters * r.refuel.price_per_liter;
  }
  return liters > 0 ? cost / liters : null;
}

function spendByMonth(rows: ReturnType<typeof refuelRows>) {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const start = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const value = rows
      .filter((r) => {
        const d = new Date(r.refuel.detected_at);
        return d >= start && d < end;
      })
      .reduce((a, r) => a + (r.total ?? 0), 0);
    return { label: monthShort(start), value, valueLabel: value > 0 ? f.eur(value, 0) : "", current: i === 5 };
  });
}

/**
 * Il prezzo al litro usato per tutti i costi. Automatico (media dei tuoi
 * rifornimenti, o dei distributori della zona) finche' non lo imposti tu.
 */
function PriceEditor({ basics }: { basics: ReturnType<typeof useBasics> }) {
  const price = basics.price;
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async (value: number | null) => {
      if (!basics.state?.vin) return;
      setSaving(true);
      Keyboard.dismiss();
      try {
        await api.setFuelPrice(basics.state.vin, value);
        setDraft(null);
        await basics.reload();
        setError(null);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Salvataggio non riuscito");
      } finally {
        setSaving(false);
      }
    },
    [basics]
  );

  const source =
    price.source === "manuale"
      ? "impostato da te"
      : price.source === "media"
        ? "media dei tuoi rifornimenti"
        : price.source === "mimit"
          ? (price.detail ?? "prezzi pubblici MIMIT")
          : "nessun dato: impostalo per vedere i costi";
  const shown = draft ?? (price.value != null ? price.value.toFixed(3).replace(".", ",") : "");
  const parsed = draft ? Number(draft.replace(",", ".")) : NaN;

  return (
    <View style={styles.price}>
      <Eyebrow>PREZZO USATO PER I COSTI</Eyebrow>
      <View style={styles.priceRow}>
        <TextInput
          value={shown}
          onChangeText={setDraft}
          keyboardType="decimal-pad"
          placeholder="1,850"
          placeholderTextColor="rgba(255,255,255,0.25)"
          style={styles.priceInput}
          selectionColor={colors.accent}
          accessibilityLabel="Prezzo al litro"
        />
        <Text style={styles.muted}>€/L · {source}</Text>
      </View>
      <View style={styles.priceActions}>
        {draft !== null && Number.isFinite(parsed) && parsed > 0 && (
          <Pressable onPress={() => save(parsed)} disabled={saving} style={[styles.priceBtn, styles.priceBtnOn]}>
            <Text style={styles.priceBtnOnText}>{saving ? "Salvo…" : "Salva"}</Text>
          </Pressable>
        )}
        {price.source === "manuale" && (
          <Pressable onPress={() => save(null)} disabled={saving} style={styles.priceBtn}>
            <Text style={styles.priceBtnText}>Torna automatico</Text>
          </Pressable>
        )}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  center: { alignItems: "center", gap: 10 },
  delta: { fontSize: 13, fontWeight: "600" },
  muted: { fontSize: 12, color: colors.textSecondary },
  explain: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  block: { gap: 12 },

  rangeBlock: { gap: 10 },
  rangeRow: { flexDirection: "row", justifyContent: "space-between", gap: 16 },
  rangeSide: { flex: 1, gap: 2 },
  right: { alignItems: "flex-end" },
  rangeValue: { fontSize: 17, fontWeight: "500", color: colors.textPrimary },

  refuel: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
  refuelLine: { borderTopWidth: 1, borderTopColor: HAIRLINE_SOFT },
  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  refuelDate: { width: 40, alignItems: "center" },
  refuelDay: { fontSize: 20, fontWeight: "300", color: colors.textPrimary },
  refuelTitle: { fontSize: 15, color: colors.textPrimary },
  refuelMeta: { fontSize: 12, color: colors.textTertiary, marginTop: 4 },
  refuelRight: { alignItems: "flex-end", gap: 4 },
  refuelTotal: { fontSize: 15, fontWeight: "500", color: colors.textPrimary },

  price: { gap: 10, paddingTop: 4 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  priceInput: {
    width: 110,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    fontSize: 17,
  },
  priceActions: { flexDirection: "row", gap: 8 },
  priceBtn: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
  },
  priceBtnOn: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  priceBtnText: { fontSize: 13, fontWeight: "500", color: colors.textPrimary },
  priceBtnOnText: { fontSize: 13, fontWeight: "600", color: colors.background },
  error: { fontSize: 12, color: colors.danger },
});
