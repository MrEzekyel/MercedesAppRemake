import { BlurView } from "expo-blur";
import { router, useFocusEffect } from "expo-router";
import type { ComponentType } from "react";
import { useCallback, useEffect, useState } from "react";
import { Animated, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, ApiError, type CommandResult } from "../src/api";
import { AppHeader } from "../src/components/AppHeader";
import { AppTabBar } from "../src/components/AppTabBar";
import { useCarTransition } from "../src/components/CarTransition";
import {
  ChevronIcon,
  ClimateIcon,
  HornIcon,
  type IconProps,
  LightIcon,
  LockIcon,
  UnlockIcon,
  WindowIcon,
} from "../src/components/icons";
import { VehicleGreeting } from "../src/components/VehicleGreeting";
import { colors, radius, spacing } from "../src/theme";
import type { TripSummary, VehicleState } from "../src/types";
import { useSwipeNav } from "../src/useSwipeNav";

type CommandKey = "toggleLock" | "windows" | "lights" | "horn" | "climate";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Stessa impaginazione della schermata di riferimento: fotografia a tutto
 * schermo, intestazione e titolo centrati in alto, colonna galleggiante a
 * destra e dati in fondo. L'unica differenza e' l'uso della colonna: li'
 * mostra l'ultimo viaggio, qui raccoglie i comandi remoti, perche' i dati
 * stanno gia' in basso.
 */
export default function VehicleDetailScreen() {
  const insets = useSafeAreaInsets();
  const { play, contentOpacity, vehicleState, reportVehicleState } = useCarTransition();
  // Parte dallo stato gia' mostrato in Home, cosi' i comandi sono pronti
  // prima ancora che arrivi la risposta del server.
  const [state, setState] = useState<VehicleState | null>(vehicleState);
  const [lastTrip, setLastTrip] = useState<TripSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<CommandKey | null>(null);

  const load = useCallback(async () => {
    try {
      const [rows, trips] = await Promise.all([api.getState(), api.listTrips({ limit: 1 })]);
      setState(rows[0] ?? null);
      setLastTrip(trips[0] ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? `Backend: ${e.message}` : "Backend non raggiungibile");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => reportVehicleState(state), [state, reportVehicleState]);

  const runCommand = useCallback(
    async (key: CommandKey, action: (vin: string) => Promise<CommandResult>) => {
      if (pending || !state?.vin) return;
      setPending(key);
      setError(null);
      try {
        const { command_id } = await action(state.vin);
        for (let i = 0; i < 20; i++) {
          const status = await api.getCommand(command_id);
          if (status.status === "failed") {
            throw new ApiError(0, status.error ?? "Comando rifiutato dall'auto");
          }
          if (status.status === "completed") break;
          await sleep(1500);
        }
        await load();
      } catch (e) {
        setError(e instanceof ApiError ? `Comando: ${e.message}` : "Comando non riuscito");
      } finally {
        setPending(null);
      }
    },
    [pending, state?.vin, load]
  );

  const locked = state?.doors_locked;
  const windowsOpen = state?.openings?.windows_overall === "open";
  const tankCapacity = state?.tank_capacity_l;
  const fuelUsedPct =
    lastTrip?.fuel_used_l != null && tankCapacity ? (lastTrip.fuel_used_l / tankCapacity) * 100 : null;

  // Come il pulsante indietro: swipe a destra riporta a Home con lo
  // stesso video al contrario. A sinistra non c'e' nulla, e' l'ultima
  // schermata di questo ramo.
  const swipe = useSwipeNav({ onSwipeRight: () => play("detail", "home", () => router.back()) });

  return (
    <View style={styles.screen} {...swipe}>
      <ImageBackground
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source={require("../assets/vehicle/rear.jpg")}
        style={styles.hero}
        imageStyle={styles.heroImage}
      >
        {/* Header e saluto identici a Home e ridisegnati sopra il video:
            restano fermi, non sfumano mai. */}
        <AppHeader />
        <VehicleGreeting state={vehicleState} />

        {/* A tutto schermo come prima: backHit, panelWrap e footer sono
            posizionati rispetto allo schermo intero, non a cio' che resta
            sotto header e saluto. box-none: lo strato non ruba i tocchi. */}
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: contentOpacity }]}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={() => play("detail", "home", () => router.back())}
            style={[styles.backHit, { top: insets.top + spacing.sm + spacing.md + 44 }]}
            hitSlop={10}
          >
            <View style={styles.backIcon}>
              <ChevronIcon size={15} color={colors.textPrimary} strokeWidth={1.6} />
            </View>
          </Pressable>

          {/* Colonna comandi: galleggia sulla foto, scorre al suo interno. */}
          <View style={styles.panelWrap}>
            <View style={styles.panelChevron}>
              <ChevronIcon size={13} color="rgba(255,255,255,0.45)" strokeWidth={1.5} />
            </View>

            <BlurView intensity={28} tint="dark" style={styles.panel}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.panelContent}>
                <CommandButton
                  Icon={locked ? UnlockIcon : LockIcon}
                  label={locked ? "Apri" : "Chiudi"}
                  caption="porte"
                  pending={pending === "toggleLock"}
                  onPress={() => runCommand("toggleLock", locked ? api.unlock : api.lock)}
                />
                <CommandButton
                  Icon={WindowIcon}
                  label={windowsOpen ? "Chiudi" : "Apri"}
                  caption="finestrini"
                  pending={pending === "windows"}
                  onPress={() =>
                    runCommand("windows", windowsOpen ? api.windowsClose : api.windowsOpen)
                  }
                />
                <CommandButton
                  Icon={LightIcon}
                  label="Luci"
                  caption="lampeggio"
                  pending={pending === "lights"}
                  onPress={() => runCommand("lights", api.flashLights)}
                />
                <CommandButton
                  Icon={HornIcon}
                  label="Clacson"
                  caption="segnale"
                  pending={pending === "horn"}
                  onPress={() => runCommand("horn", api.sound)}
                />
                <CommandButton
                  Icon={ClimateIcon}
                  label="Clima"
                  caption="avvia"
                  pending={pending === "climate"}
                  onPress={() => runCommand("climate", api.climateStart)}
                />
              </ScrollView>
            </BlurView>

            <View style={[styles.panelChevron, styles.panelChevronDown]}>
              <ChevronIcon size={13} color="rgba(255,255,255,0.45)" strokeWidth={1.5} />
            </View>
          </View>

          {/* Ultimo viaggio: numeri liberi sulla foto, separati da filetti.
              Stessa distanza dal bordo (18%) delle statistiche in Home: le
              due schermate condividono lo stesso ritmo verticale. */}
          <View style={styles.footer}>
            {error && <Text style={styles.errorText}>{error}</Text>}

            <Text style={styles.footerLabel}>
              Ultimo viaggio{lastTrip ? ` · ${shortDate(lastTrip.started_at)}` : ""}
            </Text>

            <View style={styles.footerRow}>
              <FooterStat value={fmt(lastTrip?.distance_effective_km, 1)} unit="km" label="Distanza" />
              <View style={styles.hairline} />
              <FooterStat value={fmt(fuelUsedPct, 0)} unit="%" label="Serbatoio" />
              <View style={styles.hairline} />
              <FooterStat value={fmt(lastTrip?.l_per_100km, 1)} unit="l/100" label="Consumo" />
            </View>
          </View>
        </Animated.View>
      </ImageBackground>

      {/* Dettaglio della tab "Auto": stessa tab bar, mai sfumata. */}
      <AppTabBar
        active="index"
        onSelect={(name) => {
          if (name === "index") play("detail", "home", () => router.back());
          else if (name === "trips") play("detail", "trips", () => router.replace("/trips"));
          else play("detail", "info", () => router.replace("/vehicle-info"));
        }}
      />
    </View>
  );
}

function CommandButton({
  Icon,
  label,
  caption,
  pending,
  onPress,
}: {
  Icon: ComponentType<IconProps>;
  label: string;
  caption: string;
  pending: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={pending}
      style={({ pressed }) => [styles.command, pressed && styles.commandPressed]}
    >
      <View style={[styles.commandDisc, pending && styles.commandDiscActive]}>
        <Icon size={20} color={pending ? colors.accent : colors.textPrimary} strokeWidth={1.3} />
      </View>
      <Text style={styles.commandLabel}>{label}</Text>
      <Text style={styles.commandCaption}>{pending ? "invio…" : caption}</Text>
    </Pressable>
  );
}

function FooterStat({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <View style={styles.footerStat}>
      <Text style={styles.footerValue} numberOfLines={1}>
        {value}
        <Text style={styles.footerUnit}> {unit}</Text>
      </Text>
      <Text style={styles.footerCaption}>{label}</Text>
    </View>
  );
}

function fmt(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) return "—";
  return value.toFixed(decimals);
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  hero: { flex: 1, width: "100%" },
  heroImage: { resizeMode: "cover", transform: [{ scale: 1.06 }] },

  /** Rotazione di 180°: un solo glifo chevron serve per tutte le direzioni. */
  backHit: { position: "absolute", left: spacing.md },
  backIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "180deg" }],
  },

  panelWrap: {
    position: "absolute",
    right: spacing.md,
    top: "28%",
    bottom: "26%",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  panelChevron: { transform: [{ rotate: "-90deg" }] },
  panelChevronDown: { transform: [{ rotate: "90deg" }] },
  panel: {
    flex: 1,
    width: 104,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  panelContent: { paddingVertical: spacing.sm, gap: 2 },
  command: { alignItems: "center", paddingVertical: spacing.sm, gap: 5 },
  commandPressed: { opacity: 0.55 },
  commandDisc: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  commandDiscActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  commandLabel: { color: colors.textPrimary, fontSize: 12, fontWeight: "600" },
  commandCaption: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 8.5,
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },

  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: "18%",
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  footerLabel: {
    fontSize: 9.5,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.42)",
    textAlign: "center",
  },
  footerRow: { flexDirection: "row", alignItems: "center" },
  footerStat: { flex: 1, alignItems: "center", gap: 6 },
  footerValue: { fontSize: 24, fontWeight: "600", color: colors.textPrimary, letterSpacing: -0.6 },
  footerUnit: { fontSize: 12, fontWeight: "500", color: colors.textSecondary, letterSpacing: 0 },
  footerCaption: {
    fontSize: 9.5,
    letterSpacing: 1.3,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.42)",
  },
  hairline: { width: 1, height: 30, backgroundColor: "rgba(255,255,255,0.13)" },
  errorText: { fontSize: 12, color: colors.danger, textAlign: "center" },
});
