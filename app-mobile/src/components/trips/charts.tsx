/**
 * Grafici del resoconto viaggi: tutti con la stessa grammatica (barre
 * arrotondate bianche, azzurro per l'evidenza, media tratteggiata, assi
 * con pochi valori grigi e l'unita' di misura), cosi' si leggono allo
 * stesso modo in ogni pagina.
 */
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import { colors } from "../../theme";
import { GOOD, WARN } from "./ui";

/** Gutter a sinistra per i valori dell'asse Y. */
const Y_AXIS_W = 40;

/** Arrotonda al numero "tondo" successivo (1, 2, 2.5, 5 × 10^n). */
function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

/** Tacche dell'asse Y da 0: tre o quattro valori tondi che contengono max. */
export function yTicks(max: number, count = 2): number[] {
  const step = niceStep(max / count);
  const ticks = [0];
  while (ticks[ticks.length - 1] < max - 1e-9) ticks.push(ticks[ticks.length - 1] + step);
  if (ticks.length < 2) ticks.push(step);
  return ticks;
}

/**
 * Barre per colonna con asse Y, media tratteggiata e la colonna piu' alta
 * in azzurro. Toccando una barra il titolo mostra il suo valore.
 * null = colonna nel futuro.
 */
export function Bars({
  values, names, axisLabels, width, height = 140, title, format, unit,
}: {
  values: (number | null)[];
  /** Nome di ogni colonna per il valore toccato: "20 set", "14:00". */
  names: string[];
  /** Etichette sotto l'asse X (poche, distribuite su tutta la larghezza). */
  axisLabels: string[];
  width: number;
  height?: number;
  title: string;
  format: (v: number) => string;
  /** Unita' scritta sopra l'asse Y: "km", "min", "€". */
  unit: string;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const present = values.filter((v): v is number => v != null);
  const max = Math.max(...present, 0);
  const mean = present.length > 0 ? present.reduce((a, b) => a + b, 0) / present.length : 0;
  const ticks = yTicks(max);
  const top = ticks[ticks.length - 1];
  const peak = max > 0 ? values.indexOf(max) : -1;
  const plotW = width - Y_AXIS_W;
  const gap = values.length > 20 ? 4 : values.length > 10 ? 6 : 10;
  const barW = Math.max(3, (plotW - gap * (values.length - 1)) / values.length);
  const y = (v: number) => height - (top > 0 ? (v / top) * (height - 2) : 0);
  const shown = selected != null && values[selected] != null ? selected : null;

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.barsHead}>
        <Text style={[styles.barsTitle, shown != null && styles.barsTitleOn]}>
          {shown != null ? `${names[shown]} · ${format(values[shown] as number)}` : title}
        </Text>
        <Text style={styles.barsAvg}>media {format(mean)}</Text>
      </View>
      <Text style={styles.unitNote}>{unit}</Text>
      <View style={{ height, marginTop: -4 }}>
        <Svg width={width} height={height}>
          {ticks.map((t) => (
            <Line
              key={t}
              x1={Y_AXIS_W}
              x2={width}
              y1={y(t)}
              y2={y(t)}
              stroke={t === 0 ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)"}
            />
          ))}
          {values.map((v, i) => {
            const x = Y_AXIS_W + i * (barW + gap);
            if (v == null) return <Rect key={i} x={x} y={height - 3} width={barW} height={3} rx={1.5} fill="rgba(255,255,255,0.06)" />;
            if (v === 0) return <Rect key={i} x={x} y={height - 3} width={barW} height={3} rx={1.5} fill="rgba(255,255,255,0.16)" />;
            const barTop = Math.min(y(v), height - 4);
            const on = shown === i || (shown == null && i === peak);
            return (
              <Rect
                key={i}
                x={x}
                y={barTop}
                width={barW}
                height={height - barTop}
                rx={Math.min(3, barW / 2)}
                fill={on ? colors.accent : shown != null ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.78)"}
              />
            );
          })}
          {max > 0 && (
            <Line x1={Y_AXIS_W} x2={width} y1={y(mean)} y2={y(mean)} stroke="rgba(255,255,255,0.35)" strokeDasharray="3 4" />
          )}
        </Svg>
        {ticks.map((t) => (
          <Text key={t} style={[styles.yLabel, { top: y(t) - 7 }]} numberOfLines={1}>
            {fmt1(t)}
          </Text>
        ))}
        {/* Zone toccabili, una per colonna, sopra il disegno. */}
        <View style={[StyleSheet.absoluteFill, styles.hitRow, { left: Y_AXIS_W }]}>
          {values.map((v, i) => (
            <Pressable
              key={i}
              disabled={v == null}
              onPress={() => setSelected(selected === i ? null : i)}
              style={{ width: barW + (i < values.length - 1 ? gap : 0), height }}
              accessibilityLabel={v == null ? undefined : `${names[i]}: ${format(v)}`}
            />
          ))}
        </View>
      </View>
      <View style={[styles.axis, { paddingLeft: Y_AXIS_W }]}>
        {axisLabels.map((l, i) => (
          <Text key={i} style={styles.axisText}>{l}</Text>
        ))}
      </View>
    </View>
  );
}

/**
 * Colore di un consumo in L/100 km, su scala fissa: buono sotto 6,5,
 * medio fino a 7,5, oltre cattivo (e pessimo verso i 10).
 */
export function consumptionTone(v: number): string {
  if (v < 6.5) return GOOD;
  if (v <= 7.5) return WARN;
  return colors.danger;
}

/** Linea con punti colorati per fascia, media tratteggiata e valori sugli assi; null = salto. */
export function LineChart({
  values, axisLabels, width, height = 150, min, max, avg,
}: {
  values: (number | null)[];
  axisLabels: string[];
  width: number;
  height?: number;
  min: number;
  max: number;
  avg: number | null;
}) {
  const plotW = width - Y_AXIS_W;
  const x = (i: number) => Y_AXIS_W + 6 + (i / Math.max(1, values.length - 1)) * (plotW - 12);
  const y = (v: number) => height - 6 - ((Math.min(Math.max(v, min), max) - min) / (max - min)) * (height - 12);
  const step = max - min > 6 ? 2 : 1;
  const ticks: number[] = [];
  for (let t = Math.ceil(min); t <= max; t += step) ticks.push(t);
  const pts = values.map((v, i) => (v == null ? null : ([x(i), y(v), v] as const))).filter(Boolean) as (readonly [number, number, number])[];
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.unitNote}>L/100 km</Text>
      <View style={{ height }}>
        <Svg width={width} height={height}>
          {ticks.map((t) => (
            <Line key={t} x1={Y_AXIS_W} x2={width} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.06)" />
          ))}
          {avg != null && <Line x1={Y_AXIS_W} x2={width} y1={y(avg)} y2={y(avg)} stroke="rgba(255,255,255,0.35)" strokeDasharray="3 4" />}
          {pts.length > 1 && <Path d={d} stroke={colors.accent} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />}
          {pts.map((p, i) => (
            <Circle key={i} cx={p[0]} cy={p[1]} r={3.2} fill={colors.background} stroke={consumptionTone(p[2])} strokeWidth={1.8} />
          ))}
        </Svg>
        {ticks.map((t) => (
          <Text key={t} style={[styles.yLabel, { top: y(t) - 7 }]}>{fmt1(t)}</Text>
        ))}
      </View>
      <View style={[styles.axis, { paddingLeft: Y_AXIS_W }]}>
        {axisLabels.map((l, i) => (
          <Text key={i} style={styles.axisText}>{l}</Text>
        ))}
      </View>
    </View>
  );
}

const fmt1 = (v: number) =>
  Number.isInteger(v) ? v.toLocaleString("it-IT") : v.toLocaleString("it-IT", { maximumFractionDigits: 1 });

/**
 * Dispersione distanza/consumo con griglia, la fascia dei viaggi brevi
 * evidenziata e i punti colorati per fascia di consumo. I viaggi oltre
 * xMax non si disegnano (si sceglie xMax dal selettore della pagina).
 */
export function Scatter({
  points, width, height = 190, xMax, yMin, yMax, avg, shadeBelowX, shadeLabel,
}: {
  points: { x: number; y: number }[];
  width: number;
  height?: number;
  xMax: number;
  yMin: number;
  yMax: number;
  avg: number | null;
  shadeBelowX?: number;
  shadeLabel?: string;
}) {
  const plotH = height;
  const plotW = width - Y_AXIS_W;
  const px = (v: number) => Y_AXIS_W + (Math.min(v, xMax) / xMax) * (plotW - 6);
  const py = (v: number) => plotH - 4 - ((Math.min(Math.max(v, yMin), yMax) - yMin) / (yMax - yMin)) * (plotH - 10);
  const xStep = xMax <= 30 ? 10 : xMax <= 50 ? 10 : xMax <= 100 ? 25 : niceStep(xMax / 4);
  const xTicks: number[] = [];
  for (let t = 0; t <= xMax + 1e-9; t += xStep) xTicks.push(t);
  const yStep = yMax - yMin > 6 ? 2 : 1;
  const yTicksList: number[] = [];
  for (let t = Math.ceil(yMin); t <= yMax; t += yStep) yTicksList.push(t);
  const visible = points.filter((p) => p.x <= xMax);

  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.unitNote}>L/100 km</Text>
      <View style={{ height: plotH }}>
        <Svg width={width} height={plotH}>
          {shadeBelowX != null && shadeBelowX < xMax && (
            <Rect x={Y_AXIS_W} y={0} width={px(shadeBelowX) - Y_AXIS_W} height={plotH} fill="rgba(224,166,60,0.08)" />
          )}
          {yTicksList.map((t) => (
            <Line key={`y${t}`} x1={Y_AXIS_W} x2={width} y1={py(t)} y2={py(t)} stroke="rgba(255,255,255,0.06)" />
          ))}
          {xTicks.map((t) => (
            <Line key={`x${t}`} x1={px(t)} x2={px(t)} y1={0} y2={plotH} stroke="rgba(255,255,255,0.05)" />
          ))}
          {avg != null && <Line x1={Y_AXIS_W} x2={width} y1={py(avg)} y2={py(avg)} stroke="rgba(255,255,255,0.35)" strokeDasharray="3 4" />}
          {visible.map((p, i) => (
            <Circle key={i} cx={px(p.x)} cy={py(p.y)} r={4} fill={consumptionTone(p.y)} fillOpacity={0.85} />
          ))}
        </Svg>
        {yTicksList.map((t) => (
          <Text key={t} style={[styles.yLabel, { top: py(t) - 7 }]}>{fmt1(t)}</Text>
        ))}
        {shadeLabel && shadeBelowX != null && shadeBelowX < xMax ? <Text style={styles.shadeLabel}>{shadeLabel}</Text> : null}
      </View>
      <View style={{ height: 14 }}>
        {xTicks.map((t) => (
          <Text key={t} style={[styles.axisText, styles.xLabel, { left: px(t) - 20 }]}>{t}</Text>
        ))}
      </View>
      <Text style={[styles.unitNote, styles.right]}>km del viaggio</Text>
    </View>
  );
}

export interface MonthBar {
  label: string;
  value: number;
  valueLabel: string;
  current?: boolean;
  onPress?: () => void;
}

/** Colonne larghe con il valore sopra: spesa per mese. */
export function ColumnBars({ items, height = 96 }: { items: MonthBar[]; height?: number }) {
  const max = Math.max(...items.map((i) => i.value), 0);
  return (
    <View style={[styles.columns, { height: height + 40 }]}>
      {items.map((it, i) => (
        <Pressable key={i} onPress={it.onPress} disabled={!it.onPress} style={styles.column}>
          <Text style={styles.columnValue}>{it.valueLabel}</Text>
          <View
            style={[
              styles.columnBar,
              { height: Math.max(3, max > 0 ? (it.value / max) * height : 3) },
              it.current ? styles.columnBarCurrent : null,
            ]}
          />
          <Text style={styles.axisText}>{it.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Barre orizzontali con etichetta e conteggio: distribuzione per lunghezza. */
export function HBars({ items }: { items: { label: string; value: number; highlight?: boolean }[] }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <View style={{ gap: 12 }}>
      {items.map((it) => (
        <View key={it.label} style={styles.hbarRow}>
          <Text style={styles.hbarLabel}>{it.label}</Text>
          <View style={styles.hbarTrack}>
            <View
              style={[
                styles.hbarFill,
                { width: `${(it.value / max) * 100}%`, backgroundColor: it.highlight ? WARN : colors.accent },
              ]}
            />
          </View>
          <Text style={styles.hbarValue}>{it.value}</Text>
        </View>
      ))}
    </View>
  );
}

/** Giorno della settimana × fascia oraria: piu' chiaro = piu' viaggi. */
export function Heatmap({ grid, rows, cols }: { grid: number[][]; rows: string[]; cols: string[] }) {
  const max = Math.max(...grid.flat(), 1);
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.heatRow}>
        <View style={styles.heatLabel} />
        {cols.map((c) => (
          <Text key={c} style={[styles.axisText, styles.heatCol]}>{c}</Text>
        ))}
      </View>
      {grid.map((row, r) => (
        <View key={rows[r]} style={styles.heatRow}>
          <Text style={[styles.heatLabel, styles.heatDay]}>{rows[r]}</Text>
          {row.map((v, c) => (
            <View
              key={c}
              style={[
                styles.heatCell,
                { backgroundColor: v === 0 ? "rgba(255,255,255,0.04)" : `rgba(79,143,209,${(0.18 + (v / max) * 0.82).toFixed(2)})` },
              ]}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Scala fissa del consumo, da 5 a 10 L/100 km, con le fasce di giudizio. */
const RANGE_MIN = 5;
const RANGE_MAX = 10;
const ZONES: { from: number; to: number; label: string }[] = [
  { from: 5, to: 6.5, label: "Buono" },
  { from: 6.5, to: 7.5, label: "Medio" },
  { from: 7.5, to: 8.75, label: "Cattivo" },
  { from: 8.75, to: 10, label: "Pessimo" },
];

export function RangeBar({ value }: { value: number }) {
  const at = (v: number) => (Math.min(RANGE_MAX, Math.max(RANGE_MIN, v)) - RANGE_MIN) / (RANGE_MAX - RANGE_MIN);
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.zoneRow}>
        {ZONES.map((z) => (
          <Text key={z.label} style={[styles.zoneLabel, { width: `${(at(z.to) - at(z.from)) * 100}%` }]}>{z.label}</Text>
        ))}
      </View>
      <View style={styles.range}>
        <LinearGradient
          colors={[GOOD, GOOD, WARN, colors.danger, "#8f2f2a"]}
          locations={[0, at(6.4), at(7), at(8), 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.rangeTrack}
        />
        <View style={[styles.rangeDot, { left: `${at(value) * 100}%` }]} />
      </View>
      <View style={styles.zoneTicks}>
        {[5, 6.5, 7.5, 10].map((t) => (
          <Text key={t} style={[styles.axisText, styles.zoneTick, { left: `${at(t) * 100}%` }]}>{fmt1(t)}</Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  axis: { flexDirection: "row", justifyContent: "space-between" },
  axisText: { fontSize: 11, color: colors.textTertiary },
  yLabel: { position: "absolute", left: 0, width: Y_AXIS_W - 6, fontSize: 10, color: colors.textTertiary },
  xLabel: { position: "absolute", width: 40, textAlign: "center" },
  unitNote: { fontSize: 10, fontWeight: "600", color: colors.textTertiary, letterSpacing: 0.6 },
  right: { textAlign: "right" },
  shadeLabel: { position: "absolute", left: Y_AXIS_W + 6, top: 4, fontSize: 10, fontWeight: "600", color: WARN },

  barsHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  barsTitle: { fontSize: 13, color: colors.textSecondary },
  barsTitleOn: { color: colors.textPrimary, fontWeight: "600" },
  barsAvg: { fontSize: 13, color: colors.textTertiary },
  hitRow: { flexDirection: "row" },

  columns: { flexDirection: "row", alignItems: "flex-end", gap: 14 },
  column: { flex: 1, alignItems: "center", gap: 6 },
  columnValue: { fontSize: 11, color: colors.textSecondary },
  columnBar: { width: "100%", borderRadius: 6, backgroundColor: "rgba(255,255,255,0.14)" },
  columnBarCurrent: { backgroundColor: "rgba(79,143,209,0.35)", borderWidth: 1, borderColor: colors.accent, borderStyle: "dashed" },

  hbarRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  hbarLabel: { width: 72, fontSize: 13, color: colors.textSecondary },
  hbarTrack: { flex: 1, height: 12, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.06)", overflow: "hidden" },
  hbarFill: { height: 12, borderRadius: 6 },
  hbarValue: { width: 30, textAlign: "right", fontSize: 13, color: colors.textPrimary },

  heatRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  heatLabel: { width: 34 },
  heatDay: { fontSize: 11, color: colors.textSecondary },
  heatCol: { flex: 1, textAlign: "center", fontSize: 9 },
  heatCell: { flex: 1, height: 30, borderRadius: 6 },

  zoneRow: { flexDirection: "row" },
  zoneLabel: { fontSize: 10, fontWeight: "600", letterSpacing: 1, color: colors.textTertiary, textAlign: "center" },
  zoneTicks: { height: 14 },
  zoneTick: { position: "absolute", width: 30, marginLeft: -15, textAlign: "center", fontSize: 10 },
  range: { height: 16, justifyContent: "center" },
  rangeTrack: { height: 6, borderRadius: 3 },
  rangeDot: {
    position: "absolute",
    top: -3,
    width: 22,
    height: 22,
    marginLeft: -11,
    borderRadius: 11,
    backgroundColor: colors.textPrimary,
    borderWidth: 4,
    borderColor: colors.background,
  },
});
