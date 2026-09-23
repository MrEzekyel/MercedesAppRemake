import { router } from "expo-router";
import type { ReactNode } from "react";
import { Animated, ImageBackground, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../theme";
import type { VehicleState } from "../types";
import { AppHeader } from "./AppHeader";
import { useCarTransition } from "./CarTransition";
import { LockIcon, UnlockIcon } from "./icons";

interface Props {
  state: VehicleState | null;
  /** Contenuto sovrapposto in basso sull'immagine (es. le StatTile). */
  children?: ReactNode;
}

/**
 * Scena fotografica a TUTTO schermo, come i render studio Mercedes: non una
 * card fra le altre, riempie l'intera schermata cosi' l'auto resta al
 * centro invece che schiacciata in alto. Leggero zoom per togliere il bordo
 * dello scatto originale; nessun gradiente sopra, lo shooting e' gia' scuro
 * ai bordi e il filtro lo sporcava soltanto. Toccare l'auto porta al
 * dettaglio (comandi + ultimo viaggio).
 */
export function VehicleHeroCard({ state, children }: Props) {
  const { playForward, contentOpacity } = useCarTransition();
  const locked = state?.doors_locked;
  const lockLabel =
    locked === null || locked === undefined ? "Stato sconosciuto" : locked ? "Chiusa" : "Aperta";
  const lockColor = locked ? colors.accent : colors.unlocked;
  const LockGlyph = locked ? LockIcon : UnlockIcon;

  return (
    <Pressable
      onPress={() => playForward(() => router.push("/vehicle-detail"))}
      style={styles.flexFill}
    >
      <ImageBackground
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source={require("../../assets/vehicle/front.jpg")}
        style={styles.hero}
        imageStyle={styles.heroImage}
      >
        {/* Header fisso, come la tab bar: non e' "contenuto" della
            schermata, e' la stessa navigazione presente ovunque, che
            quindi non deve mai sparire ne' rifare un fade-in proprio. */}
        <AppHeader />

        <Animated.View style={{ opacity: contentOpacity }}>
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
        </Animated.View>

        {children && (
          <Animated.View style={[styles.overlayContent, { opacity: contentOpacity }]}>
            {children}
          </Animated.View>
        )}
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
  greeting: { alignItems: "center", marginTop: spacing.md, paddingHorizontal: spacing.md },
  greetingSmall: { fontSize: 15, color: colors.textSecondary },
  name: { fontSize: 24, fontWeight: "600", color: colors.textPrimary, marginTop: 4 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.xs },
  statusText: { fontSize: 13, fontWeight: "600" },
  statusMuted: { fontSize: 13, color: colors.textTertiary },
  /**
   * Ancorato al 18% dal basso invece che al bordo: appoggiati in fondo i
   * numeri finivano sotto l'auto e a ridosso della tab bar.
   */
  overlayContent: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: "18%",
    paddingHorizontal: spacing.lg,
  },
});
