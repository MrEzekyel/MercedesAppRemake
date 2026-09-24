/**
 * Grafici del resoconto viaggi: tutti con la stessa grammatica (barre
 * arrotondate bianche, azzurro per l'evidenza, media tratteggiata, assi
 * ridotti a poche etichette grigie), cosi' si leggono allo stesso modo.
 */
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import { colors } from "../../theme";
import { GOOD, WARN } from "./ui";

/** Barre per colonna con la media tratteggiata. null = colonna nel futuro. */
export function Bars({
  values, width, height = 128, highlight, labels,
}: { values: (number | null)[]; width: number; height?: number; highlight?: number; labels: string[] }) {
  const present = values.filter((v): v is number => v != null);
  const max = Math.max(...present, 0);
  const mean = present.length > 0 ? present.reduce((a, b) => a + b, 0) / present.length : 0;
  const gap = values.length > 20 ? 5 : 8;
  const barW = Math.max(3, (width - gap * (values.length - 1)) / values.length);
  const y = (v: number) => height - (max > 0 ? (v / max) * (height - 4) : 0);

  return (
    <View style={{ gap: 8 }}>
      <Svg width={width} height={height}>
        {values.map((v, i) => {
          const x = i * (barW + gap);
          if (v == null) return <Rect key={i} x={x} y={height - 3} width={barW} height={3} rx={1.5} fill="rgba(255,255,255,0.08)" />;
          if (v === 0) return <Rect key={i} x={x} y={height - 3} width={barW} height={3} rx={1.5} fill="rgba(255,255,255,0.16)" />;
          const top = Math.min(y(v), height - 4);
          return (
            <Rect
              key={i}
              x={x}
              y={top}
              width={barW}
              height={height - top}
              rx={Math.min(3, barW / 2)}
              fill={i === highlight ? colors.accent : "rgba(255,255,255,0.78)"}
            />
          );
        })}
        {max > 0 && <Line x1={0} x2={width} y1={y(mean)} y2={y(mean)} stroke="rgba(255,255,255,0.28)" strokeDasharray="3 4" />}
      </Svg>
      <View style={styles.axis}>
        {labels.map((l, i) => (
          <Text key={i} style={styles.axisText}>{l}</Text>
        ))}
      </View>
    </View>
  );
}

/** Colore di un valore di consumo rispetto alla media: verde sotto, ambra ben sopra. */
export function consumptionTone(v: number, avg: number | null): string {
  if (avg == null) return colors.accent;
  if (v < avg * 0.85) return GOOD;
  if (v > avg * 1.12) return WARN;
  return colors.accent;
}

/** Linea con punti e media tratteggiata; i valori null sono salti. */
export function LineChart({
  values, width, height = 140, min, max, avg,
}: { values: (number | null)[]; width: number; height?: number; min: number; max: number; avg: number | null }) {
  const x = (i: number) => 6 + (i / Math.max(1, values.length - 1)) * (width - 12);
  const y = (v: number) => height - 6 - ((Math.min(Math.max(v, min), max) - min) / (max - min)) * (height - 12);
  const pts = values.map((v, i) => (v == null ? null : ([x(i), y(v), v] as const))).filter(Boolean) as (readonly [number, number, number])[];
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  return (
    <Svg width={width} height={height}>
      {avg != null && <Line x1={0} x2={width} y1={y(avg)} y2={y(avg)} stroke="rgba(255,255,255,0.3)" strokeDasharray="3 4" />}
      {pts.length > 1 && <Path d={d} stroke={colors.accent} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />}
      {pts.map((p, i) => (
        <Circle key={i} cx={p[0]} cy={p[1]} r={3} fill={colors.background} stroke={consumptionTone(p[2], avg)} strokeWidth={1.8} />
      ))}
    </Svg>
  );
}

/** Dispersione distanza/consumo con la fascia dei viaggi brevi evidenziata. */
export function Scatter({
  points, width, height = 170, xMax, yMin, yMax, avg, shadeBelowX, shadeLabel,
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
  const plotH = height - 20;
  const px = (v: number) => 24 + (Math.min(v, xMax) / xMax) * (width - 32);
  const py = (v: number) => plotH - ((Math.min(Math.max(v, yMin), yMax) - yMin) / (yMax - yMin)) * (plotH - 6);
  return (
    <View>
      <Svg width={width} height={height}>
        {shadeBelowX != null && <Rect x={24} y={0} width={px(shadeBelowX) - 24} height={plotH} fill="rgba(224,166,60,0.1)" />}
        <Line x1={24} x2={width} y1={plotH} y2={plotH} stroke="rgba(255,255,255,0.12)" />
        {avg != null && <Line x1={24} x2={width} y1={py(avg)} y2={py(avg)} stroke="rgba(255,255,255,0.3)" strokeDasharray="3 4" />}
        {points.map((p, i) => (
          <Circle
            key={i}
            cx={px(p.x)}
            cy={py(p.y)}
            r={4}
            fill={shadeBelowX != null && p.x < shadeBelowX ? "rgba(224,166,60,0.9)" : "rgba(79,143,209,0.8)"}
          />
        ))}
      </Svg>
      {shadeLabel ? <Text style={[styles.shadeLabel]}>{shadeLabel}</Text> : null}
      <Text style={[styles.axisText, styles.yTop]}>{yMax}</Text>
      <Text style={[styles.axisText, styles.yBottom, { top: plotH - 12 }]}>{yMin}</Text>
      <View style={[styles.axis, { paddingLeft: 24 }]}>
        <Text style={styles.axisText}>0 km</Text>
        <Text style={styles.axisText}>{xMax} km</Text>
      </View>
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

/** Scala dal migliore al peggiore con il punto sul valore attuale. */
export function RangeBar({ min, max, value }: { min: number; max: number; value: number }) {
  const pos = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0.5;
  return (
    <View style={styles.range}>
      <LinearGradient colors={[GOOD, WARN, colors.danger]} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.rangeTrack} />
      <View style={[styles.rangeDot, { left: `${pos * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  axis: { flexDirection: "row", justifyContent: "space-between" },
  axisText: { fontSize: 11, color: colors.textTertiary },
  yTop: { position: "absolute", left: 0, top: 0, fontSize: 10 },
  yBottom: { position: "absolute", left: 0, fontSize: 10 },
  shadeLabel: { position: "absolute", left: 30, top: 4, fontSize: 10, fontWeight: "600", color: WARN },

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
