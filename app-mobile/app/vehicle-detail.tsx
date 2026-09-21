import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api, ApiError, type CommandResult } from "../src/api";
import { colors, radius, spacing, typography } from "../src/theme";
import type { TripSummary, VehicleState } from "../src/types";

type CommandKey = "toggleLock" | "windows" | "lights" | "horn";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function VehicleDetailScreen() {
  const [state, setState] = useState<VehicleState | null>(null);
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
  const tankCapacity = state?.tank_capacity_l;
  const fuelUsedPct =
    lastTrip?.fuel_used_l != null && tankCapacity ? (lastTrip.fuel_used_l / tankCapacity) * 100 : null;

  return (
    <View style={styles.screen}>
      <ImageBackground
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source={require("../assets/vehicle/rear.jpg")}
        style={styles.hero}
        imageStyle={styles.heroImage}
      >
        <LinearGradient
          colors={["transparent", "rgba(6,9,16,0.5)", colors.background]}
          locations={[0, 0.6, 1]}
          style={StyleSheet.absoluteFillObject}
        />

        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{state?.display_name ?? "Classe A Premium"}</Text>
          <View style={{ width: 34 }} />
        </View>

        {/* Pannello comandi, scorrevole al suo interno */}
        <BlurView intensity={40} tint="dark" style={styles.panel}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.panelContent}>
            <CommandRow
              icon={locked ? "lock-open-outline" : "lock-closed-outline"}
              label={locked ? "Apri" : "Chiudi"}
              pending={pending === "toggleLock"}
              onPress={() => runCommand("toggleLock", locked ? api.unlock : api.lock)}
            />
            <CommandRow
              icon="square-outline"
              label="Finestrini"
              pending={pending === "windows"}
              onPress={() => runCommand("windows", api.windowsClose)}
            />
            <CommandRow
              icon="flash-outline"
              label="Luci"
              pending={pending === "lights"}
              onPress={() => runCommand("lights", api.flashLights)}
            />
            <CommandRow
              icon="megaphone-outline"
              label="Clacson"
              pending={pending === "horn"}
              onPress={() => runCommand("horn", api.sound)}
            />
          </ScrollView>
        </BlurView>
      </ImageBackground>

      <View style={styles.body}>
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Text style={styles.sectionLabel}>Ultimo viaggio</Text>
        <View style={styles.tripCard}>
          <TripStat value={fmt(lastTrip?.distance_effective_km, 0)} unit="km" label="Percorsi" />
          <View style={styles.tripDivider} />
          <TripStat value={fmt(fuelUsedPct, 0)} unit="%" label="Serbatoio usato" />
          <View style={styles.tripDivider} />
          <TripStat value={fmt(lastTrip?.l_per_100km)} unit="L/100" label="Consumo medio" />
        </View>
      </View>
    </View>
  );
}

function CommandRow({
  icon,
  label,
  pending,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  pending: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} disabled={pending} style={styles.commandRow}>
      <View style={[styles.commandBadge, pending && styles.commandBadgeActive]}>
        <Ionicons name={icon} size={17} color={pending ? colors.accent : colors.textPrimary} />
      </View>
      <Text style={styles.commandLabel}>{label}</Text>
      {pending ? (
        <Text style={styles.commandStatus}>in corso…</Text>
      ) : (
        <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
      )}
    </Pressable>
  );
}

function TripStat({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <View style={styles.tripStat}>
      <Text style={styles.tripValue}>
        {value}
        <Text style={styles.tripUnit}> {unit}</Text>
      </Text>
      <Text style={styles.tripLabel}>{label}</Text>
    </View>
  );
}

function fmt(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) return "—";
  return value.toFixed(decimals);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  hero: { width: "100%", height: 480 },
  heroImage: { resizeMode: "cover" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: spacing.xl + spacing.md,
    paddingHorizontal: spacing.md,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  panel: {
    position: "absolute",
    right: spacing.md,
    top: 130,
    bottom: 24,
    width: 150,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  panelContent: { padding: spacing.sm, gap: spacing.sm },
  commandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: radius.md,
    padding: spacing.xs,
  },
  commandBadge: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  commandBadgeActive: { backgroundColor: colors.accentSoft },
  commandLabel: { flex: 1, color: colors.textPrimary, fontSize: 12, fontWeight: "500" },
  commandStatus: { color: colors.accent, fontSize: 9 },
  body: { paddingHorizontal: spacing.md, marginTop: spacing.lg, gap: spacing.sm },
  errorBanner: { backgroundColor: "rgba(193,85,77,0.14)", borderRadius: 12, padding: spacing.sm },
  errorText: { ...typography.caption, color: colors.danger },
  sectionLabel: { ...typography.statLabel, color: colors.textTertiary, textTransform: "uppercase" },
  tripCard: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  tripStat: { flex: 1, alignItems: "center", gap: 4 },
  tripDivider: { width: 1, backgroundColor: colors.border },
  tripValue: { ...typography.statValue, color: colors.textPrimary },
  tripUnit: { ...typography.caption, color: colors.textTertiary },
  tripLabel: { ...typography.statLabel, color: colors.textTertiary, textTransform: "uppercase" },
});
