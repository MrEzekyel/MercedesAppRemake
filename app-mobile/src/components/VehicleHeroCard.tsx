import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { ImageBackground, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../theme";
import type { VehicleState } from "../types";

interface Props {
  state: VehicleState | null;
  /** Contenuto sovrapposto in basso sull'immagine (es. le StatTile). */
  children?: ReactNode;
}

/**
 * Scena fotografica a TUTTO schermo, come i render studio Mercedes: non una
 * card fra le altre, riempie l'intera schermata cosi' l'auto resta al
 * centro invece che schiacciata in alto. Leggero zoom sull'immagine per
 * eliminare il bordo/le tende visibili ai lati dello scatto originale.
 * Usa lo shooting professionale vero dell'auto (vista frontale qui; il
 * profilo e' in Viaggi, il retro nel dettaglio veicolo). Toccare l'auto
 * porta al dettaglio (stato completo + comandi).
 */
export function VehicleHeroCard({ state, children }: Props) {
  const locked = state?.doors_locked;
  const lockLabel =
    locked === null || locked === undefined ? "Stato sconosciuto" : locked ? "Chiusa" : "Aperta";

  return (
    <Pressable onPress={() => router.push("/vehicle-detail")} style={styles.flexFill}>
      <ImageBackground
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source={require("../../assets/vehicle/front.jpg")}
        style={styles.hero}
        imageStyle={styles.heroImage}
      >
        <LinearGradient
          colors={["transparent", "rgba(6,9,16,0.5)", colors.background]}
          locations={[0, 0.62, 1]}
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
          <Text style={styles.greetingSmall}>Ciao Andrea</Text>
          <Text style={styles.name}>{state?.display_name ?? "Classe A Premium"}</Text>
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

        {children && <View style={styles.overlayContent}>{children}</View>}
      </ImageBackground>
    </Pressable>
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
  flexFill: { flex: 1 },
  hero: { flex: 1, width: "100%" },
  heroImage: { resizeMode: "cover", transform: [{ scale: 1.09 }] },
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
  greeting: { alignItems: "center", marginTop: spacing.md, paddingHorizontal: spacing.md },
  greetingSmall: { fontSize: 15, color: colors.textSecondary },
  name: { fontSize: 24, fontWeight: "600", color: colors.textPrimary, marginTop: 4 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.xs },
  statusText: { fontSize: 13, fontWeight: "600" },
  statusMuted: { fontSize: 13, color: colors.textTertiary },
  overlayContent: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
});
