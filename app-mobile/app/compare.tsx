import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SubPage } from "../src/components/trips/SubPage";
import { Eyebrow, GOOD, HAIRLINE_SOFT, PeriodNav, Segmented } from "../src/components/trips/ui";
import { colors, radius, spacing } from "../src/theme";
import { useBasics, useTrips } from "../src/trips/data";
import * as f from "../src/trips/format";
import { periodFor, previousRange } from "../src/trips/period";
import { delta, totals, type Totals } from "../src/trips/stats";

type Mode = "month" | "year" | "yoy";

/**
 * Due periodi a specchio: A a sinistra, B a destra, barre che si guardano.
 * B segue A: il mese (o l'anno) prima, oppure lo stesso mese dell'anno
 * scorso. Per un periodo in corso si confronta lo stesso tratto di giorni.
 */
export default function CompareScreen() {
  const [mode, setMode] = useState<Mode>("month");
  const [offset, setOffset] = useState(0);
  const basics = useBasics();
  const price = basics.price.value;

  const a = useMemo(() => periodFor(mode === "year" ? "year" : "month", offset), [mode, offset]);
  const b = useMemo(() => {
    if (mode !== "yoy") return previousRange(a) as { start: Date; end: Date };
    const shift = (d: Date) => new Date(d.getFullYear() - 1, d.getMonth(), d.getDate(), d.getHours(), d.getMinutes());
    return { start: shift(a.start), end: shift(a.end) };
  }, [a, mode]);
  const tripsA = useTrips(a).trips;
  const tripsB = useTrips(b).trips;
  const A = totals(tripsA, price);
  const B = totals(tripsB, price);

  const labelA = a.label;
  const labelB =
    mode === "year"
      ? String(b.start.getFullYear())
      : `${capital(b.start.toLocaleDateString("it-IT", { month: "long" }))}${mode === "yoy" ? ` ${b.start.getFullYear()}` : ""}`;
  const partial = a.end < a.fullEnd;
  const range = partial && mode !== "year" ? `1–${a.end.getDate()}` : mode === "year" && partial ? `fino al ${f.shortDate(a.end)}` : "";

  const rows = [
    row("KM", A.km, B.km, (v) => f.km(v)),
    row("VIAGGI", A.trips, B.trips, (v) => String(v)),
    row("ALLA GUIDA", A.seconds, B.seconds, (v) => f.duration(v)),
    row("CONSUMO", A.lPer100, B.lPer100, (v) => f.num(v), true),
    row("CARBURANTE", A.cost, B.cost, (v) => f.eur(v)),
    row("€ AL KM", A.costPerKm, B.costPerKm, (v) => f.num(v, 3), true),
  ];

  return (
    <SubPage title="Confronta">
      <Segmented
        options={[
          { key: "month", label: "Mese" },
          { key: "year", label: "Anno" },
          { key: "yoy", label: "Anno scorso" },
        ]}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setOffset(0);
        }}
      />
      <PeriodNav caption={a.caption} onPrev={() => setOffset((o) => o - 1)} onNext={() => setOffset((o) => Math.min(0, o + 1))} canNext={offset < 0} />

      <View style={styles.heads}>
        <View style={styles.headSide}>
          <Eyebrow color={colors.accent}>A</Eyebrow>
          <Text style={styles.headName}>{labelA.replace(/ \d{4}$/, "")}</Text>
          <Text style={styles.headSub}>{mode === "year" ? range : [range, String(a.start.getFullYear())].filter(Boolean).join(" · ")}</Text>
        </View>
        <Text style={styles.vs}>vs</Text>
        <View style={[styles.headSide, styles.right]}>
          <Eyebrow color={colors.textSecondary}>B</Eyebrow>
          <Text style={styles.headName}>{labelB.replace(/ \d{4}$/, "")}</Text>
          <Text style={styles.headSub}>{mode === "year" ? range : [range, String(b.start.getFullYear())].filter(Boolean).join(" · ")}</Text>
        </View>
      </View>

      <View>
        {rows.map((r) => (
          <View key={r.label} style={styles.row}>
            <View style={styles.values}>
              <Text style={styles.valueA}>{r.a}</Text>
              <View style={styles.middle}>
                <Eyebrow>{r.label}</Eyebrow>
                <Text style={[styles.delta, { color: r.good ? GOOD : colors.textSecondary }]}>{r.delta}</Text>
              </View>
              <Text style={styles.valueB}>{r.b}</Text>
            </View>
            <View style={styles.bars}>
              <View style={[styles.track, styles.trackA]}>
                <View style={[styles.fill, { width: `${r.wa}%`, backgroundColor: colors.accent }]} />
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${r.wb}%`, backgroundColor: "rgba(255,255,255,0.4)" }]} />
              </View>
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.summary}>{summary(A, B)}</Text>
    </SubPage>
  );
}

/** Una riga: valori, variazione e larghezza delle barre. Per consumo e €/km scendere e' un bene. */
function row(label: string, a: number | null, b: number | null, fmt: (v: number) => string, lowerIsBetter = false) {
  const d = delta(a, b);
  const max = Math.max(a ?? 0, b ?? 0);
  return {
    label,
    a: a == null ? "—" : fmt(a),
    b: b == null ? "—" : fmt(b),
    delta: d == null ? "—" : f.pct(d),
    good: lowerIsBetter && d != null && d < 0,
    wa: max > 0 ? Math.round(((a ?? 0) / max) * 100) : 0,
    wb: max > 0 ? Math.round(((b ?? 0) / max) * 100) : 0,
  };
}

function summary(A: Totals, B: Totals): string {
  if (A.trips === 0 && B.trips === 0) return "Nessun viaggio in entrambi i periodi.";
  if (B.trips === 0) return "Nel periodo B non ci sono viaggi da confrontare.";
  const km = delta(A.km, B.km);
  const perKm = delta(A.costPerKm, B.costPerKm);
  const cons = delta(A.lPer100, B.lPer100);
  const parts: string[] = [];
  if (km != null) parts.push(km >= 0 ? `Hai guidato il ${f.num(km * 100, 0)}% in più` : `Hai guidato il ${f.num(-km * 100, 0)}% in meno`);
  if (perKm != null && Math.abs(perKm) >= 0.02) parts.push(perKm < 0 ? "ogni km ti è costato meno" : "ogni km ti è costato di più");
  if (cons != null && Math.abs(cons) >= 0.02) parts.push(`il consumo è ${cons < 0 ? "sceso" : "salito"} a ${f.num(A.lPer100)} L/100 km`);
  return parts.length ? `${parts.join(", ")}.` : "I due periodi sono quasi identici.";
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const styles = StyleSheet.create({
  heads: { flexDirection: "row", alignItems: "flex-end" },
  headSide: { flex: 1, gap: 2 },
  right: { alignItems: "flex-end" },
  headName: { fontSize: 22, fontWeight: "600", color: colors.textPrimary },
  headSub: { fontSize: 12, color: colors.textTertiary },
  vs: { width: 40, textAlign: "center", fontSize: 13, color: colors.textTertiary, paddingBottom: 18 },

  row: { paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: HAIRLINE_SOFT, gap: 10 },
  values: { flexDirection: "row", alignItems: "baseline", gap: 10 },
  valueA: { flex: 1, fontSize: 22, fontWeight: "300", color: colors.textPrimary },
  valueB: { flex: 1, fontSize: 22, fontWeight: "300", color: colors.textSecondary, textAlign: "right" },
  middle: { alignItems: "center", gap: 2 },
  delta: { fontSize: 12, fontWeight: "600" },
  bars: { flexDirection: "row", gap: 4 },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.06)", flexDirection: "row", overflow: "hidden" },
  trackA: { justifyContent: "flex-end" },
  fill: { height: 6, borderRadius: 3 },

  summary: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(255,255,255,0.86)",
    overflow: "hidden",
  },
});
