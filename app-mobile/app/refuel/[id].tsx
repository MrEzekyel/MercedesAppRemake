import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { api, ApiError } from "../../src/api";
import { colors, radius, spacing, typography } from "../../src/theme";
import type { Refuel } from "../../src/types";

export default function ConfirmRefuelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [refuel, setRefuel] = useState<Refuel | null>(null);
  const [liters, setLiters] = useState("");
  const [cost, setCost] = useState("");
  const [fullTank, setFullTank] = useState(true);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.listRefuels({ status: "pending" }).then((rows) => {
      const found = rows.find((r) => r.id === id) ?? null;
      setRefuel(found);
      if (found?.liters_estimated) setLiters(found.liters_estimated.toFixed(1));
    });
  }, [id]);

  const priceHint =
    liters && cost && Number(liters) > 0
      ? `€${(Number(cost) / Number(liters)).toFixed(3)}/L`
      : null;

  async function onConfirm() {
    const litersValue = Number(liters.replace(",", "."));
    if (!litersValue || litersValue <= 0) {
      Alert.alert("Litri mancanti", "Inserisci quanti litri hai messo.");
      return;
    }
    setSaving(true);
    try {
      await api.confirmRefuel(id, {
        liters: litersValue,
        cost_eur: cost ? Number(cost.replace(",", ".")) : null,
        full_tank: fullTank,
        notes: notes || null,
      });
      router.back();
    } catch (e) {
      Alert.alert("Errore", e instanceof ApiError ? e.message : "Backend non raggiungibile");
    } finally {
      setSaving(false);
    }
  }

  function onDiscard() {
    Alert.alert("Scartare questo rilevamento?", "Non era un rifornimento vero (es. sensore rumoroso).", [
      { text: "Annulla", style: "cancel" },
      {
        text: "Scarta",
        style: "destructive",
        onPress: async () => {
          await api.deleteRefuel(id);
          router.back();
        },
      },
    ]);
  }

  if (!refuel) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.textSecondary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.detected}>
          Rilevato salto {refuel.fuel_level_before_pct?.toFixed(0)}% →{" "}
          {refuel.fuel_level_after_pct?.toFixed(0)}%
          {refuel.liters_estimated ? ` (stima ${refuel.liters_estimated.toFixed(1)} L)` : ""}
        </Text>

        <Field label="Litri">
          <TextInput
            style={styles.input}
            value={liters}
            onChangeText={setLiters}
            keyboardType="decimal-pad"
            placeholder="0.0"
            placeholderTextColor={colors.textTertiary}
          />
        </Field>

        <Field label="Spesa (€)">
          <TextInput
            style={styles.input}
            value={cost}
            onChangeText={setCost}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.textTertiary}
          />
        </Field>

        {priceHint && <Text style={styles.priceHint}>{priceHint}</Text>}

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Pieno completo</Text>
          <Switch value={fullTank} onValueChange={setFullTank} trackColor={{ true: colors.accent }} />
        </View>

        <Field label="Note (opzionale)">
          <TextInput
            style={styles.input}
            value={notes}
            onChangeText={setNotes}
            placeholder="es. distributore, marca carburante..."
            placeholderTextColor={colors.textTertiary}
          />
        </Field>

        <Pressable style={styles.confirmButton} onPress={onConfirm} disabled={saving}>
          <Text style={styles.confirmButtonText}>{saving ? "Salvataggio…" : "Conferma"}</Text>
        </Pressable>

        <Pressable style={styles.discardButton} onPress={onDiscard}>
          <Text style={styles.discardButtonText}>Non era un rifornimento</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.lg, gap: spacing.md },
  detected: { ...typography.caption, color: colors.textTertiary, marginBottom: spacing.sm },
  field: { gap: spacing.xs },
  fieldLabel: { ...typography.caption, color: colors.textSecondary },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: 16,
  },
  priceHint: { ...typography.caption, color: colors.textTertiary, marginTop: -spacing.sm },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  switchLabel: { ...typography.body, color: colors.textPrimary },
  confirmButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    padding: spacing.md,
    alignItems: "center",
    marginTop: spacing.md,
  },
  confirmButtonText: { ...typography.body, color: "#000", fontWeight: "700" },
  discardButton: { alignItems: "center", padding: spacing.sm },
  discardButtonText: { ...typography.caption, color: colors.danger },
});
