import { router } from "expo-router";
import type { ReactNode } from "react";
import { Animated, ImageBackground, Pressable, StyleSheet } from "react-native";
import { spacing } from "../theme";
import type { VehicleState } from "../types";
import { AppHeader } from "./AppHeader";
import { useCarTransition } from "./CarTransition";
import { VehicleGreeting } from "./VehicleGreeting";

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

  return (
    <Pressable
      onPress={() => playForward(() => router.push("/vehicle-detail"), state)}
      style={styles.flexFill}
    >
      <ImageBackground
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source={require("../../assets/vehicle/front.jpg")}
        style={styles.hero}
        imageStyle={styles.heroImage}
      >
        {/* Header e saluto sono identici nel dettaglio e vengono ridisegnati
            sopra il video: restano fermi, non sfumano mai. */}
        <AppHeader />
        <VehicleGreeting state={state} />

        {children && (
          <Animated.View style={[styles.overlayContent, { opacity: contentOpacity }]}>
            {children}
          </Animated.View>
        )}
      </ImageBackground>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flexFill: { flex: 1 },
  hero: { flex: 1, width: "100%" },
  heroImage: { resizeMode: "cover", transform: [{ scale: 1.09 }] },
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
