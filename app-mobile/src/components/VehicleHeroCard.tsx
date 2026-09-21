import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../theme";
import type { VehicleState } from "../types";

interface Props {
  state: VehicleState | null;
}

/**
 * Nessuna telemetria in tempo reale, nessuna silhouette 3D che ruota:
 * quello lo fa Tesla perche' ha i sensori per animarla davvero. Qui
 * l'onesta' conta piu' dell'effetto - lo stato di chiusura ben leggibile,
 * e i dati veri sotto.
 *
 * L'icona sotto e' un segnaposto: non ho potuto generare una foto vera
 * della W177 da qui. Per sostituirla, metti un file in
 * app-mobile/assets/car-w177.png (silhouette dall'alto, sfondo trasparente
 * come nell'app Tesla) e cambia questo blocco in
 * <Image source={require("../../assets/car-w177.png")} style={styles.carImage} resizeMode="contain" />
 */
export function VehicleHeroCard({ state }: Props) {
  const locked = state?.doors_locked;
  const lockLabel = locked === null || locked === undefined
    ? "Stato sconosciuto"
    : locked ? "Chiusa" : "Aperta";

  return (
    <View style={styles.card}>
      <Text style={styles.name}>{state?.display_name ?? "Mercedes"}</Text>

      <View style={styles.carPlaceholder}>
        <Ionicons name="car-sport-outline" size={96} color={colors.textTertiary} />
      </View>

      <View style={styles.statusRow}>
        <Ionicons
          name={locked ? "lock-closed" : "lock-open"}
          size={16}
          color={locked ? colors.locked : colors.unlocked}
        />
        <Text style={[styles.statusText, { color: locked ? colors.locked : colors.unlocked }]}>
          {lockLabel}
        </Text>
        {state?.updated_at && (
          <Text style={styles.statusMuted}>· aggiornato {timeAgo(state.updated_at)}</Text>
        )}
      </View>
    </View>
  );
}

function timeAgo(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "ora";
  if (diffMin < 60) return `${diffMin} min fa`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} h fa`;
  return `${Math.round(diffH / 24)} g fa`;
}

const styles = StyleSheet.create({
  card: { alignItems: "center", paddingTop: spacing.lg, gap: spacing.sm },
  name: { ...typography.title, color: colors.textPrimary },
  carPlaceholder: {
    width: "100%",
    height: 180,
    marginVertical: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  statusText: { ...typography.caption, fontWeight: "600" },
  statusMuted: { ...typography.caption, color: colors.textTertiary },
});
