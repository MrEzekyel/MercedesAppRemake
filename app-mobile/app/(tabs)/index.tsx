import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, ApiError } from "../../src/api";
import { QuickActionButton } from "../../src/components/QuickActionButton";
import { StatTile } from "../../src/components/StatTile";
import { VehicleHeroCard } from "../../src/components/VehicleHeroCard";
import { colors, spacing, typography } from "../../src/theme";
import type { VehicleState } from "../../src/types";

export default function StatoScreen() {
  const [state, setState] = useState<VehicleState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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
        <QuickActionButton icon="lock-closed" label="Chiudi" comingSoon />
        <QuickActionButton icon="lock-open" label="Apri" comingSoon />
        <QuickActionButton icon="snow" label="Clima" comingSoon />
        <QuickActionButton icon="flash" label="Luci" comingSoon />
      </View>

      <View style={styles.statsGrid}>
        <StatTile label="Carburante" value={fmt(state?.fuel_level_pct)} unit="%" />
        <StatTile label="Autonomia" value={fmt(state?.range_km, 0)} unit="km" />
        <StatTile label="Km totali" value={fmt(state?.odometer_km, 0)} unit="km" />
      </View>

      <Text style={styles.hint}>
        I comandi rapidi (apri/chiudi, clima, luci) arrivano nel prossimo aggiornamento del
        backend — qui e' gia' pronto il posto dove compariranno.
      </Text>
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
  hint: { ...typography.caption, color: colors.textTertiary, textAlign: "center" },
});
