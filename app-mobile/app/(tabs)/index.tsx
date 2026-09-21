import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, ApiError } from "../../src/api";
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
      <VehicleHeroCard state={state} />

      <View style={styles.body}>
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.statsGrid}>
          <StatTile icon="water-outline" label="Carburante" value={fmt(state?.fuel_level_pct)} unit="%" />
          <StatTile icon="speedometer-outline" label="Autonomia" value={fmt(state?.range_km, 0)} unit="km" />
          <StatTile icon="time-outline" label="Km totali" value={fmt(state?.odometer_km, 0)} unit="km" />
        </View>

        <Text style={styles.hint}>Tocca l'auto per aprire lo stato completo e i comandi</Text>
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
  content: { paddingBottom: spacing.xl },
  body: { paddingHorizontal: spacing.md, gap: spacing.md, marginTop: -spacing.lg },
  errorBanner: {
    backgroundColor: "rgba(193,85,77,0.14)",
    borderRadius: 12,
    padding: spacing.sm,
  },
  errorText: { ...typography.caption, color: colors.danger },
  statsGrid: { flexDirection: "row", gap: spacing.sm },
  hint: { ...typography.caption, color: colors.textTertiary, textAlign: "center" },
});
