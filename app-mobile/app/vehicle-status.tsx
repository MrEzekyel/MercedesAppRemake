import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, ApiError } from "../src/api";
import { colors, radius, spacing, typography } from "../src/theme";
import type { VehicleState } from "../src/types";

const DOOR_LABELS: Record<string, string> = {
  door_front_left: "Anteriore sinistra",
  door_front_right: "Anteriore destra",
  door_rear_left: "Posteriore sinistra",
  door_rear_right: "Posteriore destra",
};

const WINDOW_LABELS: Record<string, string> = {
  window_front_left: "Anteriore sinistro",
  window_front_right: "Anteriore destro",
  window_rear_left: "Posteriore sinistro",
  window_rear_right: "Posteriore destro",
};

const WARNING_LABELS: Record<string, string> = {
  brake_fluid: "Liquido freni",
  coolant_low: "Liquido raffreddamento",
  engine_light: "Spia motore",
  washer_fluid: "Liquido lavavetri",
  brake_pad_wear: "Usura pastiglie freni",
};

const TIRE_LABELS: Record<string, string> = {
  front_left: "Ant. SX",
  front_right: "Ant. DX",
  rear_left: "Post. SX",
  rear_right: "Post. DX",
};

export default function VehicleStatusScreen() {
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
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (!state) {
    return (
      <View style={styles.centered}>
        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <Text style={styles.emptyText}>Caricamento…</Text>
        )}
      </View>
    );
  }

  const openings = state.openings ?? {};
  const activeWarnings = Object.entries(WARNING_LABELS).filter(([key]) => state.warnings?.[key]);
  const tires = Object.entries(TIRE_LABELS).filter(([key]) => state.tire_pressures?.[key] != null);
  const service = state.service_interval_days;
  const ecoTotal = Math.round(
    ((state.eco_score?.accel ?? 0) + (state.eco_score?.const ?? 0) + (state.eco_score?.freewheel ?? 0)) / 3
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

      {/* Generale */}
      <SectionLabel>Generale</SectionLabel>
      <View style={styles.card}>
        <InfoRow
          icon={state.doors_locked ? "lock-closed-outline" : "lock-open-outline"}
          label="Serratura"
          value={state.doors_locked ? "Chiusa" : "Aperta"}
          tone={state.doors_locked ? "ok" : "warn"}
        />
        <InfoRow
          icon="hand-left-outline"
          label="Freno di stazionamento"
          value={state.park_brake_engaged ? "Inserito" : "Disinserito"}
          tone={state.park_brake_engaged ? "ok" : "neutral"}
        />
        <InfoRow
          icon="car-sport-outline"
          label="Cofano"
          value={openings.hood === "open" ? "Aperto" : "Chiuso"}
          tone={openings.hood === "open" ? "warn" : "ok"}
          last
        />
      </View>

      {/* Porte */}
      <SectionLabel>Porte</SectionLabel>
      <View style={styles.card}>
        {Object.entries(DOOR_LABELS).map(([key, label], i, arr) => (
          <InfoRow
            key={key}
            icon="reorder-two-outline"
            label={label}
            value={openings[key] === "open" ? "Aperta" : "Chiusa"}
            tone={openings[key] === "open" ? "warn" : "ok"}
            last={i === arr.length - 1}
          />
        ))}
      </View>

      {/* Finestrini */}
      <SectionLabel>Finestrini</SectionLabel>
      <View style={styles.card}>
        {Object.entries(WINDOW_LABELS).map(([key, label], i, arr) => (
          <InfoRow
            key={key}
            icon="square-outline"
            label={label}
            value={windowLabel(openings[key])}
            tone={openings[key] === "closed" || !openings[key] ? "ok" : "warn"}
            last={i === arr.length - 1}
          />
        ))}
      </View>

      {/* Pneumatici */}
      {tires.length > 0 && (
        <>
          <SectionLabel>Pneumatici</SectionLabel>
          <View style={styles.tiresGrid}>
            {tires.map(([key, label]) => {
              const bar = state.tire_pressures[key];
              const tone = bar < 1.8 || bar > 2.6 ? colors.warning : colors.accent;
              return (
                <View key={key} style={styles.tireTile}>
                  <Ionicons name="ellipse-outline" size={16} color={tone} />
                  <Text style={styles.tireValue}>
                    {bar.toFixed(2)}
                    <Text style={styles.tireUnit}> bar</Text>
                  </Text>
                  <Text style={styles.tireLabel}>{label}</Text>
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* Avvisi */}
      <SectionLabel>Avvisi</SectionLabel>
      <View style={styles.card}>
        {activeWarnings.length === 0 ? (
          <InfoRow icon="checkmark-circle-outline" label="Nessun avviso attivo" value="" tone="ok" last />
        ) : (
          activeWarnings.map(([key, label], i, arr) => (
            <InfoRow
              key={key}
              icon="alert-circle-outline"
              label={label}
              value="Attivo"
              tone="danger"
              last={i === arr.length - 1}
            />
          ))
        )}
      </View>

      {/* Manutenzione */}
      <SectionLabel>Manutenzione</SectionLabel>
      <View style={styles.card}>
        <InfoRow
          icon="build-outline"
          label="Prossimo tagliando"
          value={service == null ? "—" : service < 0 ? `Scaduto da ${Math.abs(service)} giorni` : `Tra ${service} giorni`}
          tone={service != null && service < 0 ? "danger" : "neutral"}
          last
        />
      </View>

      {/* Efficienza */}
      <SectionLabel>Efficienza di guida</SectionLabel>
      <View style={styles.card}>
        <EcoBar label="Punteggio complessivo" value={ecoTotal} />
        <EcoBar label="Accelerazione" value={state.eco_score?.accel ?? 0} />
        <EcoBar label="Costanza" value={state.eco_score?.const ?? 0} />
        <EcoBar label="Veleggio" value={state.eco_score?.freewheel ?? 0} last />
      </View>
    </ScrollView>
  );
}

function windowLabel(status: string | undefined): string {
  switch (status) {
    case "open":
      return "Aperto";
    case "airing":
      return "Aerazione";
    case "intermediate":
      return "Parziale";
    default:
      return "Chiuso";
  }
}

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

type Tone = "ok" | "warn" | "danger" | "neutral";

const TONE_COLORS: Record<Tone, string> = {
  ok: colors.accent,
  warn: colors.warning,
  danger: colors.danger,
  neutral: colors.textSecondary,
};

function InfoRow({
  icon,
  label,
  value,
  tone,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tone: Tone;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Ionicons name={icon} size={17} color={TONE_COLORS[tone]} style={styles.rowIcon} />
      <Text style={styles.rowLabel}>{label}</Text>
      {value !== "" && <Text style={[styles.rowValue, { color: TONE_COLORS[tone] }]}>{value}</Text>}
    </View>
  );
}

function EcoBar({ label, value, last }: { label: string; value: number; last?: boolean }) {
  return (
    <View style={[styles.ecoRow, !last && styles.rowBorder]}>
      <View style={styles.ecoHeader}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.ecoValue}>{Math.round(value)}%</Text>
      </View>
      <View style={styles.ecoTrack}>
        <View style={[styles.ecoFill, { width: `${Math.min(100, Math.max(0, value))}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.xs, paddingBottom: spacing.xl },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  errorBanner: { backgroundColor: "rgba(193,85,77,0.14)", borderRadius: 12, padding: spacing.sm },
  errorText: { ...typography.caption, color: colors.danger },
  emptyText: { ...typography.body, color: colors.textTertiary },
  sectionLabel: {
    ...typography.statLabel,
    color: colors.textTertiary,
    textTransform: "uppercase",
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm + 2, gap: spacing.sm },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowIcon: { width: 20 },
  rowLabel: { ...typography.body, color: colors.textPrimary, flex: 1, fontSize: 14 },
  rowValue: { fontSize: 13, fontWeight: "600" },
  tiresGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tireTile: {
    width: "47%",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    gap: 4,
  },
  tireValue: { ...typography.statValue, color: colors.textPrimary, marginTop: 4 },
  tireUnit: { ...typography.caption, color: colors.textTertiary },
  tireLabel: { ...typography.statLabel, color: colors.textTertiary, textTransform: "uppercase" },
  ecoRow: { paddingVertical: spacing.sm + 2, gap: 6 },
  ecoHeader: { flexDirection: "row", justifyContent: "space-between" },
  ecoValue: { fontSize: 13, fontWeight: "600", color: colors.accent },
  ecoTrack: { height: 5, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden" },
  ecoFill: { height: "100%", backgroundColor: colors.accent, borderRadius: 3 },
});
