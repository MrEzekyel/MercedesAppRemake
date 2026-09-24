import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api, ApiError } from "../src/api";
import { ColumnBars, LineChart, RangeBar, Scatter } from "../src/components/trips/charts";
import { CONTENT_W, SubPage } from "../src/components/trips/SubPage";
import {
  BigFigure, EmptyNote, Eyebrow, GOOD, SectionHeader, Segmented, SmallPill, StatGrid, WARN, HAIRLINE_SOFT,
} from "../src/components/trips/ui";
import { colors, radius } from "../src/theme";
import { useBasics, useTrips } from "../src/trips/data";
import * as f from "../src/trips/format";
import { bucketsFor, monthShort, periodFor, previousRange, type PeriodKind } from "../src/trips/period";
import { describeTrip } from "../src/trips/places";
import { closedTrips, consumptionSeries, delta, distanceBuckets, refuelRows, totals } from "../src/trips/stats";

const KINDS: { kind: PeriodKind; label: string }[] = [
  { kind: "month", label: "Mese" },
  { kind: "year", label: "Anno" },
  { kind: "all", label: "Tutto" },
];
const ALL_SINCE = new Date(2000, 0, 1);

/**
 * Consumi e costi: quanto beve l'auto, perche' (viaggi brevi, giorni
 * peggiori), quanto costa e quanto hai pagato la benzina. Il prezzo al
 * litro e' l'unico dato che l'auto non sa: sta in fondo, modificabile.
 */
export default function ConsumiScreen() {
  const [kindIndex, setKindIndex] = useState(0);
  const [unit, setUnit] = useState<"l100" | "kml">("l100");
  const kind = KINDS[kindIndex].kind;
  const period = useMemo(() => periodFor(kind, 0), [kind]);
  const { trips } = useTrips(kind === "all" ? { start: ALL_SINCE, end: period.end } : period);
  const prevRange = useMemo(() => previousRange(period), [period]);
  const prev = useTrips(prevRange);
  const basics = useBasics();
  const price = basics.price;

  const cur = totals(trips, price.value);
  const before = totals(prev.trips, price.value);
  const consDelta = prevRange ? delta(cur.lPer100, before.lPer100) : null;

  const withCons = closedTrips(trips).filter((t) => t.l_per_100km != null && t.l_per_100km > 0);
  const efficient = withCons.filter((t) => (t.distance_effective_km ?? 0) >= 3);
  const best = efficient.length ? efficient.reduce((a, b) => ((b.l_per_100km ?? 99) < (a.l_per_100km ?? 99) ? b : a)) : null;
  const worst = withCons.length ? withCons.reduce((a, b) => ((b.l_per_100km ?? 0) > (a.l_per_100km ?? 0) ? b : a)) : null;

  const buckets = useMemo(
    () => bucketsFor(kind === "all" && trips.length ? periodFor("all", 0, new Date(), new Date(trips[trips.length - 1].started_at)) : period),
    [kind, period, trips]
  );
  const daily = consumptionSeries(trips, buckets);
  const short = distanceBuckets(trips)[0];
  const xMax = Math.max(30, Math.ceil(Math.max(...withCons.map((t) => t.distance_effective_km ?? 0), 0) / 10) * 10);

  const days = Math.max(1, (period.end.getTime() - (kind === "all" && trips.length ? new Date(trips[trips.length - 1].started_at).getTime() : period.start.getTime())) / 86400000);
  const rows = refuelRows(basics.refuels, price.value);
  const months = spendByMonth(rows);

  const [zone, setZone] = useState<number | null>(null);
  useEffect(() => {
    if (!basics.state?.vin) return;
    api.getFuelPriceAverage(basics.state.vin).then((a) => setZone(a.price)).catch(() => setZone(null));
  }, [basics.state?.vin]);
  const paid = paidPrice(rows);
  const vsZone = paid != null && zone != null ? (paid - zone) * 100 : null;

  const shown = (v: number | null) => (v == null ? "—" : unit === "l100" ? f.num(v) : f.num(100 / v));

  return (
    <SubPage
      title="Consumi e costi"
      right={<SmallPill label={KINDS[kindIndex].label} onPress={() => setKindIndex((i) => (i + 1) % KINDS.length)} />}
    >
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
        ) : (
          <Text style={styles.muted}>{period.caption}</Text>
        )}
      </View>

      {best && worst && cur.lPer100 != null && (
        <View style={styles.rangeBlock}>
          <RangeBar min={best.l_per_100km as number} max={worst.l_per_100km as number} value={cur.lPer100} />
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
        </View>
      )}

      <View style={styles.block}>
        <SectionHeader
          title={kind === "month" ? "Giorno per giorno" : "Mese per mese"}
          right={cur.lPer100 != null ? `- - media ${f.num(cur.lPer100)}` : undefined}
        />
        {daily.some((v) => v != null) ? (
          <LineChart
            values={daily}
            width={CONTENT_W}
            min={Math.max(0, Math.floor(Math.min(...daily.filter((v): v is number => v != null)) - 1))}
            max={Math.ceil(Math.max(...daily.filter((v): v is number => v != null)) + 1)}
            avg={cur.lPer100}
          />
        ) : (
          <EmptyNote text="Nessun consumo registrato in questo periodo." />
        )}
      </View>

      {withCons.length >= 3 && (
        <View style={styles.block}>
          <SectionHeader title="Distanza e consumo" />
          <Text style={styles.explain}>
            Ogni punto è un viaggio. A sinistra i tragitti brevi, a motore ancora freddo: consumano di più.
          </Text>
          <Scatter
            points={withCons.map((t) => ({ x: t.distance_effective_km ?? 0, y: t.l_per_100km as number }))}
            width={CONTENT_W}
            xMax={xMax}
            yMin={Math.max(0, Math.floor(Math.min(...withCons.map((t) => t.l_per_100km as number))) - 1)}
            yMax={Math.ceil(Math.max(...withCons.map((t) => t.l_per_100km as number))) + 1}
            avg={cur.lPer100}
            shadeBelowX={5}
            shadeLabel={short.lPer100 != null ? `sotto i 5 km · ${f.num(short.lPer100)}` : undefined}
          />
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
          <EmptyNote text="Nessun rifornimento rilevato: compaiono da soli quando il livello del serbatoio sale." />
        ) : (
          rows.slice(0, 4).map((r) => {
            const d = new Date(r.refuel.detected_at);
            const pending = r.refuel.status === "pending";
            return (
              <Pressable
                key={r.refuel.id}
                onPress={() => router.push(pending ? `/refuel/${r.refuel.id}` : "/refuels")}
                style={({ pressed }) => [styles.refuel, pressed && styles.pressed]}
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

  refuel: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, borderTopWidth: 1, borderTopColor: HAIRLINE_SOFT },
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
