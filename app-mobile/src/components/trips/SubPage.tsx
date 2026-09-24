/**
 * Guscio delle pagine di approfondimento di Viaggi (Consumi, Abitudini,
 * Record, Confronto, dettaglio viaggio).
 *
 * Header, saluto e tab bar sono gli stessi componenti delle tab: con la
 * dissolvenza fra le pagine (vedi app/_layout.tsx) restano fermi al loro
 * posto e cambia solo cio' che sta sotto. Dietro, la foto di Viaggi sfocata
 * fa da atmosfera; una pagina puo' passarne un'altra (mappa, render).
 */
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Dimensions, Image, ScrollView, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, spacing } from "../../theme";
import { AppHeader } from "../AppHeader";
import { AppTabBar, type TabName } from "../AppTabBar";
import { TAB_SCENE, useCarTransition } from "../CarTransition";
import { VehicleGreeting } from "../VehicleGreeting";
import { SubPageBar } from "./ui";

const { width: SCREEN_W } = Dimensions.get("window");

/** Larghezza utile del contenuto (margini laterali di 16). */
export const CONTENT_W = SCREEN_W - spacing.md * 2;

export function BlurredHero() {
  return (
    <View style={styles.heroWrap} pointerEvents="none">
      <Image
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source={require("../../../assets/vehicle/trips.jpg")}
        style={styles.hero}
        blurRadius={28}
        resizeMode="cover"
      />
      <LinearGradient colors={["rgba(6,9,16,0)", colors.background]} style={styles.heroFade} />
    </View>
  );
}

/** Esce dall'approfondimento verso una tab: Viaggi e' sotto, le altre con il video. */
export function useLeaveToTab() {
  const { play } = useCarTransition();
  return (name: TabName) => {
    if (router.canDismiss()) router.dismissAll();
    if (name === "trips") return;
    play(TAB_SCENE.trips, TAB_SCENE[name], () => router.navigate(name === "index" ? "/" : "/vehicle-info"));
  };
}

export function SubPage({
  title, right, backdrop, children, backLabel,
}: { title: string; right?: ReactNode; backdrop?: ReactNode; children: ReactNode; backLabel?: string }) {
  const { vehicleState } = useCarTransition();
  const leave = useLeaveToTab();
  return (
    <View style={styles.screen}>
      {backdrop === undefined ? <BlurredHero /> : backdrop}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppHeader />
        <VehicleGreeting state={vehicleState} />
        <View style={styles.body}>
          <SubPageBar title={title} right={right} backLabel={backLabel} onBack={() => router.back()} />
          {children}
        </View>
      </ScrollView>
      <AppTabBar active="trips" onSelect={leave} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  heroWrap: { position: "absolute", top: 0, left: 0, right: 0, height: 520 },
  hero: { position: "absolute", top: -60, left: -40, width: SCREEN_W + 80, height: 580, opacity: 0.55 },
  heroFade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 220 },
  content: { paddingBottom: 130 },
  body: { paddingHorizontal: spacing.md, gap: 26 },
});
