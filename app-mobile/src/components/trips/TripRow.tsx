import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";
import * as f from "../../trips/format";
import type { Endpoint } from "../../trips/places";
import type { TripSummary } from "../../types";
import { Dot } from "./ui";

/** Un viaggio in elenco: ora, da → a, numeri essenziali, costo. */
export function TripRow({
  trip, from, to, cost, onPress,
}: { trip: TripSummary; from: Endpoint; to: Endpoint; cost: number | null; onPress: () => void }) {
  const meta = [
    `${f.km(trip.distance_effective_km)} km`,
    f.duration(trip.duration_s),
    trip.l_per_100km != null ? `${f.num(trip.l_per_100km)} L/100 km` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Text style={styles.time}>{f.time(trip.started_at)}</Text>
      <View style={styles.center}>
        <View style={styles.title}>
          {from.color ? <Dot color={from.color} /> : null}
          <Text style={styles.name} numberOfLines={1}>{from.name}</Text>
          <Text style={styles.arrow}>→</Text>
          {to.color ? <Dot color={to.color} /> : null}
          <Text style={[styles.name, styles.shrink]} numberOfLines={1}>{to.name}</Text>
        </View>
        <Text style={styles.meta}>{meta}</Text>
      </View>
      {cost != null ? <Text style={styles.cost}>{f.eur(cost)}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  pressed: { opacity: 0.6 },
  time: { width: 42, fontSize: 13, color: colors.textSecondary },
  center: { flex: 1, gap: 3, minWidth: 0 },
  title: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontSize: 15, color: colors.textPrimary, flexShrink: 0, maxWidth: "48%" },
  shrink: { flexShrink: 1 },
  arrow: { fontSize: 15, color: colors.textTertiary },
  meta: { fontSize: 12, color: colors.textTertiary },
  cost: { fontSize: 15, fontWeight: "500", color: colors.textPrimary },
});
