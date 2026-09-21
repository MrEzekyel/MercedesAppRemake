import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, ApiError } from "../../src/api";
import { FuelIcon, OdometerIcon, RangeIcon } from "../../src/components/icons";
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
      <View style={styles.fill}>
        <VehicleHeroCard state={state}>
          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.statsGrid}>
            <StatTile Icon={FuelIcon} label="Carburante" value={fmt(state?.fuel_level_pct, 0)} unit="%" />
            <StatTile Icon={RangeIcon} label="Autonomia" value={fmt(state?.range_km, 0)} unit=" km" />
            <StatTile Icon={OdometerIcon} label="Percorsi" value={fmtKm(state?.odometer_km)} unit=" km" />
          </View>
        </VehicleHeroCard>
      </View>
    </ScrollView>
  );
}

function fmt(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) return "—";
  return value.toFixed(decimals);
}

/** Il contachilometri e' a cinque cifre: senza separatore diventa illeggibile. */
function fmtKm(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return Math.round(value).toLocaleString("it-IT");
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1 },
  fill: { flex: 1 },
  errorBanner: {
    backgroundColor: "rgba(193,85,77,0.14)",
    borderRadius: 12,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  errorText: { ...typography.caption, color: colors.danger },
  statsGrid: { flexDirection: "row" },
});
