import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ImageBackground, StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../theme";
import type { VehicleState } from "../types";

interface Props {
  state: VehicleState | null;
}

/**
 * Scena fotografica a piena pagina, come i render studio Mercedes: non una
 * card fra le altre. Usa lo shooting professionale vero dell'auto
 * (app-mobile/assets/vehicle/hero.jpg, profilo laterale; front.jpg e
 * rear.jpg disponibili per altre schermate).
 */
export function VehicleHeroCard({ state }: Props) {
  const locked = state?.doors_locked;
  const lockLabel =
    locked === null || locked === undefined ? "Stato sconosciuto" : locked ? "Chiusa" : "Aperta";

  return (
    <ImageBackground
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      source={require("../../assets/vehicle/hero.jpg")}
      style={styles.hero}
      imageStyle={styles.heroImage}
    >
      <LinearGradient
        colors={["transparent", "rgba(6,9,16,0.55)", colors.background]}
        locations={[0, 0.55, 1]}
        style={styles.overlay}
      />

      <View style={styles.headerRow}>
        <Ionicons name="menu-outline" size={20} color={colors.textPrimary} style={{ opacity: 0.85 }} />
        <View style={styles.monogram}>
          <View style={styles.monogramDot} />
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarLabel}>A</Text>
        </View>
      </View>

      <View style={styles.greeting}>
        <Text style={styles.greetingSmall}>Buongiorno, Andrea</Text>
        <Text style={styles.name}>{state?.display_name ?? "Classe A"}</Text>
        <View style={styles.statusRow}>
          <Ionicons
            name={locked ? "lock-closed" : "lock-open"}
            size={13}
            color={locked ? colors.accent : colors.unlocked}
          />
          <Text style={[styles.statusText, { color: locked ? colors.accent : colors.unlocked }]}>
            {lockLabel}
          </Text>
          {state?.updated_at && (
            <Text style={styles.statusMuted}>· aggiornato {timeAgo(state.updated_at)}</Text>
          )}
        </View>
      </View>
    </ImageBackground>
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
  hero: { width: "100%", height: 560 },
  heroImage: { resizeMode: "cover" },
  overlay: { ...StyleSheet.absoluteFillObject },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: spacing.xl + spacing.md,
    paddingHorizontal: spacing.md,
  },
  monogram: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  monogramDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.accent },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLabel: { color: colors.textPrimary, fontSize: 11, fontWeight: "600" },
  greeting: { paddingHorizontal: spacing.md, marginTop: spacing.md },
  greetingSmall: { ...typography.caption, color: colors.textSecondary },
  name: { fontSize: 26, fontWeight: "600", color: colors.textPrimary, marginTop: 2 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.xs },
  statusText: { ...typography.caption, fontWeight: "600" },
  statusMuted: { ...typography.caption, color: colors.textTertiary },
});
