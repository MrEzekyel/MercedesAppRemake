/**
 * I consumi per viaggio letti come colonna di numeri non dicono nulla: il
 * valore sta nell'andamento. Qui ogni viaggio e' una barra (l/100km) con la
 * media tratteggiata sopra, cosi' si vede a colpo d'occhio quali viaggi
 * sono sopra o sotto la propria media. Disegnato a mano in SVG: una
 * libreria di grafici porterebbe uno stile che non e' quello dell'app.
 */
import { StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Line, Rect, Stop } from "react-native-svg";
import { colors, spacing } from "../theme";
import type { TripSummary } from "../types";

const HEIGHT = 128;
const MAX_BARS = 14;

interface Props {
  trips: TripSummary[];
  width: number;
}

export function ConsumptionChart({ trips, width }: Props) {
  // I viaggi arrivano dal piu' recente: il grafico va letto da sinistra a
  // destra nel tempo, quindi si inverte e si tengono solo gli ultimi.
  const points = trips
    .filter((t) => t.l_per_100km !== null && t.l_per_100km > 0)
    .slice(0, MAX_BARS)
    .reverse();

  if (points.length < 2) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          Servono almeno due viaggi con consumo registrato per disegnare l&apos;andamento
        </Text>
      </View>
    );
  }

  const values = points.map((t) => t.l_per_100km as number);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  // Scala che parte da zero: partire dal minimo esagererebbe differenze di
  // pochi decimi facendole sembrare crolli.
  const max = Math.max(...values) * 1.15;

  const gap = 6;
  const barWidth = (width - gap * (points.length - 1)) / points.length;
  const y = (v: number) => HEIGHT - (v / max) * HEIGHT;

  return (
    <View>
      <Svg width={width} height={HEIGHT}>
        <Defs>
          <LinearGradient id="bar" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.accent} stopOpacity="0.85" />
            <Stop offset="1" stopColor={colors.accent} stopOpacity="0.12" />
          </LinearGradient>
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

        {points.map((trip, i) => {
          const top = y(values[i]);
          return (
            <Rect
              key={trip.id}
              x={i * (barWidth + gap)}
              y={top}
              width={barWidth}
              height={HEIGHT - top}
              rx={Math.min(barWidth / 2, 5)}
              fill="url(#bar)"
            />
          );
        })}
      </Svg>

      <View style={styles.axis}>
        <Text style={styles.axisLabel}>{label(points[0])}</Text>
        <Text style={styles.axisAvg}>media {avg.toFixed(1)} l/100km</Text>
        <Text style={styles.axisLabel}>{label(points[points.length - 1])}</Text>
      </View>
    </View>
  );
}

function label(trip: TripSummary): string {
  return new Date(trip.started_at).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
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
