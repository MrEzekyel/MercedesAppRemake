import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, ApiError, type CommandResult } from "../../src/api";
import { QuickActionButton } from "../../src/components/QuickActionButton";
import { StatTile } from "../../src/components/StatTile";
import { VehicleHeroCard } from "../../src/components/VehicleHeroCard";
import { colors, spacing, typography } from "../../src/theme";
import type { VehicleState } from "../../src/types";

type CommandKey = "lock" | "unlock" | "climate" | "lights";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function StatoScreen() {
  const [state, setState] = useState<VehicleState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<CommandKey | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await api.getState();
      setState(rows[0] ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? `Backend: ${e.message}` : "Backend non raggiungibile");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const interval = setInterval(load, 30_000);
      return () => clearInterval(interval);
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const runCommand = useCallback(
    async (key: CommandKey, action: (vin: string) => Promise<CommandResult>) => {
      if (pending || !state?.vin) return;
      setPending(key);
      setError(null);
      try {
        const { command_id } = await action(state.vin);
        // L'esito (successo/rifiuto/PIN sbagliato) arriva in modo asincrono
        // dai server Mercedes: qui aspettiamo che command_log esca da
        // "pending", con un timeout perche' un comando puo' anche non avere
        // mai risposta (auto non raggiungibile).
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

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} />
      }
    >
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <VehicleHeroCard state={state} />

      <View style={styles.actionsRow}>
        <QuickActionButton
          icon="lock-closed"
          label="Chiudi"
          active={pending === "lock"}
          onPress={() => runCommand("lock", api.lock)}
        />
        <QuickActionButton
          icon="lock-open"
          label="Apri"
          active={pending === "unlock"}
          onPress={() => runCommand("unlock", api.unlock)}
        />
        <QuickActionButton
          icon="snow"
          label="Clima"
          active={pending === "climate"}
          onPress={() => runCommand("climate", api.climateStart)}
        />
        <QuickActionButton
          icon="flash"
          label="Luci"
          active={pending === "lights"}
          onPress={() => runCommand("lights", api.flashLights)}
        />
      </View>

      <View style={styles.statsGrid}>
        <StatTile label="Carburante" value={fmt(state?.fuel_level_pct)} unit="%" />
        <StatTile label="Autonomia" value={fmt(state?.range_km, 0)} unit="km" />
        <StatTile label="Km totali" value={fmt(state?.odometer_km, 0)} unit="km" />
      </View>
    </ScrollView>
  );
}

function fmt(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) return "—";
  return value.toFixed(decimals);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl, gap: spacing.lg },
  errorBanner: {
    backgroundColor: "rgba(255,69,58,0.12)",
    borderRadius: 12,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  errorText: { ...typography.caption, color: colors.danger },
  actionsRow: { flexDirection: "row", justifyContent: "space-around" },
  statsGrid: { flexDirection: "row", gap: spacing.sm },
});
