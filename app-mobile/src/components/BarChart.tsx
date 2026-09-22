/**
 * Istogramma generico: una barra per periodo, con la media tratteggiata.
 *
 * La scala parte sempre da zero. Partendo dal minimo, differenze di pochi
 * centesimi sembrerebbero crolli verticali: su spesa e consumi e' una
 * bugia grafica che non vale la leggibilita' guadagnata.
 */
import { StyleSheet, Text, View } from "react-native";
import Svg, { Defs, Line, Rect, Stop, LinearGradient as SvgGradient } from "react-native-svg";
import { colors, spacing } from "../theme";

export interface Bar {
  key: string;
  label: string;
  value: number;
}

interface Props {
  bars: Bar[];
  width: number;
  height?: number;
  /** Mostrato accanto alla media, es. "€" o "l/100km". */
  unit?: string;
  emptyText?: string;
}

export function BarChart({ bars, width, height = 128, unit = "", emptyText }: Props) {
  if (bars.length < 2) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          {emptyText ?? "Servono almeno due periodi per disegnare l'andamento"}
        </Text>
      </View>
    );
  }

  const values = bars.map((b) => b.value);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const max = Math.max(...values) * 1.15 || 1;

  const gap = bars.length > 10 ? 4 : 8;
  const barWidth = (width - gap * (bars.length - 1)) / bars.length;
  const y = (v: number) => height - (v / max) * height;

  return (
    <View>
      <Svg width={width} height={height}>
        <Defs>
          <SvgGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.accent} stopOpacity="0.85" />
            <Stop offset="1" stopColor={colors.accent} stopOpacity="0.12" />
          </SvgGradient>
        </Defs>

        <Line
          x1="0"
          y1={y(avg)}
          x2={width}
          y2={y(avg)}
          stroke="rgba(255,255,255,0.28)"
          strokeWidth={1}
          strokeDasharray="3 4"
        />

        {bars.map((bar, i) => {
          const top = y(bar.value);
          return (
            <Rect
              key={bar.key}
              x={i * (barWidth + gap)}
              y={top}
              width={barWidth}
              height={Math.max(height - top, 1)}
              rx={Math.min(barWidth / 2, 5)}
              fill="url(#barFill)"
            />
          );
        })}
      </Svg>

      <View style={styles.axis}>
        <Text style={styles.axisLabel}>{bars[0].label}</Text>
        <Text style={styles.axisAvg}>
          media {formatNumber(avg)}
          {unit ? ` ${unit}` : ""}
        </Text>
        <Text style={styles.axisLabel}>{bars[bars.length - 1].label}</Text>
      </View>
    </View>
  );
}

function formatNumber(value: number): string {
  return value.toFixed(value >= 100 ? 0 : 1).replace(".", ",");
}

const styles = StyleSheet.create({
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.md },
  emptyText: { fontSize: 12, color: colors.textTertiary, textAlign: "center", lineHeight: 18 },
  axis: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  axisLabel: { fontSize: 9.5, letterSpacing: 0.8, color: "rgba(255,255,255,0.38)" },
  axisAvg: { fontSize: 9.5, letterSpacing: 0.8, color: colors.accent },
});
