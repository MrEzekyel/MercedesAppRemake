import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { api, ApiError } from "../../src/api";
import { colors, radius, spacing, typography } from "../../src/theme";
import type { Refuel } from "../../src/types";

export default function RifornimentiScreen() {
  const [refuels, setRefuels] = useState<Refuel[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .listRefuels()
      .then((rows) => {
        setRefuels(rows);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Backend non raggiungibile"));
  }, []);

  useFocusEffect(load);

  const shortcut = (
    <Pressable
      onPress={() => router.push("/vehicle-status")}
      style={({ pressed }) => [styles.shortcut, pressed && styles.rowPressed]}
    >
      <View style={styles.shortcutIcon}>
        <Ionicons name="pulse-outline" size={18} color={colors.accent} />
      </View>
      <View style={styles.rowCenter}>
        <Text style={styles.rowDate}>Stato del veicolo</Text>
        <Text style={styles.rowMeta}>Gomme, porte, finestrini e altro</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Pressable>
  );

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (refuels.length === 0) {
    return (
      <View style={styles.screen}>
        <View style={styles.list}>{shortcut}</View>
        <View style={styles.emptyBody}>
          <Ionicons name="water-outline" size={40} color={colors.textTertiary} />
          <Text style={styles.emptyText}>Nessun rifornimento ancora</Text>
        </View>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.list}
      data={refuels}
      keyExtractor={(r) => r.id}
      ListHeaderComponent={shortcut}
      renderItem={({ item }) => <RefuelRow refuel={item} />}
    />
  );
}

function RefuelRow({ refuel }: { refuel: Refuel }) {
  const date = new Date(refuel.detected_at);
  const pending = refuel.status === "pending";

  return (
    <Pressable
      onPress={() => pending && router.push(`/refuel/${refuel.id}`)}
      style={({ pressed }) => [
        styles.row,
        pending && styles.rowPending,
        pressed && pending && styles.rowPressed,
      ]}
    >
      <View style={styles.rowLeft}>
        <Ionicons
          name={pending ? "alert-circle" : "checkmark-circle"}
          size={22}
          color={pending ? colors.warning : colors.success}
        />
      </View>

      <View style={styles.rowCenter}>
        <Text style={styles.rowDate}>
          {date.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}
        </Text>
        <Text style={styles.rowMeta}>
          {pending
            ? `Da confermare · stima ${fmt(refuel.liters_estimated)} L`
            : `${fmt(refuel.liters)} L · €${fmt(refuel.cost_eur, 2)}${
                refuel.price_per_liter ? ` · €${fmt(refuel.price_per_liter, 3)}/L` : ""
              }`}
        </Text>
      </View>

      {pending && <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />}
    </Pressable>
  );
}

function fmt(value: number | null, decimals = 1): string {
  return value === null ? "—" : value.toFixed(decimals);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.md, gap: spacing.sm },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.lg,
  },
  errorText: { ...typography.body, color: colors.danger, textAlign: "center" },
  emptyText: { ...typography.body, color: colors.textTertiary },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  rowPending: { borderWidth: 1, borderColor: "rgba(255,176,32,0.35)" },
  rowPressed: { opacity: 0.7 },
  rowLeft: { width: 22 },
  rowCenter: { flex: 1, gap: 2 },
  rowDate: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  rowMeta: { ...typography.caption, color: colors.textTertiary },
  emptyBody: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  shortcut: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  shortcutIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
});
