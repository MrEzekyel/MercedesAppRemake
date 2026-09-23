import { StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../theme";
import type { VehicleState } from "../types";
import { LockIcon, UnlockIcon } from "./icons";

/**
 * Saluto + nome + stato serratura sotto l'header. Identico in Home, nel
 * dettaglio e sopra il video di transizione: resta fermo mentre il resto
 * della schermata cambia, quindi deve essere lo stesso componente ovunque.
 */
export function VehicleGreeting({ state }: { state: VehicleState | null }) {
  const locked = state?.doors_locked;
  const lockLabel =
    locked === null || locked === undefined ? "Stato sconosciuto" : locked ? "Chiusa" : "Aperta";
  const lockColor = locked ? colors.accent : colors.unlocked;
  const LockGlyph = locked ? LockIcon : UnlockIcon;

  return (
    <View style={styles.greeting}>
      <Text style={styles.greetingSmall}>Ciao Andrea</Text>
      <Text style={styles.name}>{state?.display_name ?? "Classe A Premium"}</Text>
      <View style={styles.statusRow}>
        <LockGlyph size={13} color={lockColor} strokeWidth={1.6} />
        <Text style={[styles.statusText, { color: lockColor }]}>{lockLabel}</Text>
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
  greeting: { alignItems: "center", marginTop: spacing.md, paddingHorizontal: spacing.md },
  greetingSmall: { fontSize: 15, color: colors.textSecondary },
  name: { fontSize: 24, fontWeight: "600", color: colors.textPrimary, marginTop: 4 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.xs },
  statusText: { fontSize: 13, fontWeight: "600" },
  statusMuted: { fontSize: 13, color: colors.textTertiary },
});
