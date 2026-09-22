import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  Dimensions,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api, ApiError } from "../src/api";
import { type Bar, BarChart } from "../src/components/BarChart";
import { formatEur, refuelCost, tripCost } from "../src/fuel";
import { useFuelPrice } from "../src/useFuelPrice";
import { colors, radius, spacing } from "../src/theme";
import type { Refuel, TripSummary, VehicleState } from "../src/types";

const CHART_W = Dimensions.get("window").width - spacing.md * 2 - spacing.lg * 2;

/**
 * I consumi nel tempo.
 *
 * Due letture complementari: quanto beve l'auto (litri per 100 km, dal
 * computer di bordo) e quanto costa (euro al mese, dai rifornimenti
 * rilevati). La seconda dipende dal prezzo al litro, l'unico dato che
 * l'auto non sa: sta in cima, modificabile, e dichiara da dove arriva
 * quando non e' stato imposto a mano.
 */
export default function ConsumiScreen() {
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [refuels, setRefuels] = useState<Refuel[]>([]);
  const [state, setState] = useState<VehicleState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, r, s] = await Promise.all([
        api.listTrips({ limit: 200 }),
        api.listRefuels({ limit: 200 }),
        api.getState(),
      ]);
      setTrips(t);
      setRefuels(r);
      setState(s[0] ?? null);
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

  const price = useFuelPrice(state, refuels);

  const savePrice = useCallback(
    async (value: number | null) => {
      if (!state?.vin) return;
      setSaving(true);
      Keyboard.dismiss();
      try {
        await api.setFuelPrice(state.vin, value);
        // Il draft va allineato al valore salvato, non azzerato: azzerandolo
        // il campo si svuota per il tempo del reload e sembra aver perso il
        // dato appena inserito.
        setDraft(value != null ? value.toFixed(3).replace(".", ",") : null);
        await load();
      } catch (e) {
        setError(e instanceof ApiError ? `Salvataggio: ${e.message}` : "Salvataggio non riuscito");
      } finally {
        setSaving(false);
      }
    },
    [state?.vin, load]
  );

  const closed = trips.filter((t) => t.ended_at !== null);
  const totalKm = sum(closed.map((t) => t.distance_effective_km));
  const totalFuel = sum(closed.map((t) => t.fuel_used_l));
  const avgConsumption = totalKm > 0 && totalFuel > 0 ? (totalFuel / totalKm) * 100 : null;
  const totalSpend = sum(refuels.map((r) => refuelCost(r, price.value)));
  const costPerKm = totalKm > 0 && totalSpend > 0 ? totalSpend / totalKm : null;
  const confirmed = refuels.filter((r) => r.status === "confirmed").length;

  const spendBars = monthlyBars(refuels, (r) => refuelCost(r, price.value), (r) => r.detected_at);
  const consumptionBars: Bar[] = closed
    .filter((t) => t.l_per_100km != null && t.l_per_100km > 0)
    .slice(0, 14)
    .reverse()
    .map((t) => ({
      key: t.id,
      label: new Date(t.started_at).toLocaleDateString("it-IT", { day: "numeric", month: "short" }),
      value: t.l_per_100km as number,
    }));

  const shown = draft ?? (price.value != null ? price.value.toFixed(3).replace(".", ",") : "");

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {error && <Text style={styles.errorText}>{error}</Text>}

      <Text style={styles.sectionLabel}>Prezzo carburante</Text>
      <View style={styles.priceCard}>
        <View style={styles.priceRow}>
          <TextInput
            value={shown}
            onChangeText={setDraft}
            keyboardType="decimal-pad"
            placeholder="1,850"
            placeholderTextColor="rgba(255,255,255,0.25)"
            style={styles.priceInput}
            selectionColor={colors.accent}
          />
          <Text style={styles.priceUnit}>€ / litro</Text>
        </View>

        <Text style={styles.priceSource}>
          {price.source === "manuale"
            ? "Impostato da te"
            : price.source === "media"
              ? `Media dei tuoi rifornimenti confermati (${confirmed})`
              : price.source === "mimit"
                ? (price.detail ?? "Stima dai prezzi pubblici MIMIT")
                : "Nessun rifornimento confermato: imposta un prezzo per vedere i costi"}
        </Text>

        <View style={styles.priceActions}>
          <Pressable
            disabled={saving || draft === null}
            onPress={() => savePrice(parseDecimal(draft))}
            style={({ pressed }) => [
              styles.button,
              styles.buttonPrimary,
              (saving || draft === null) && styles.buttonDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.buttonPrimaryLabel}>{saving ? "Salvo…" : "Salva"}</Text>
          </Pressable>

          <Pressable
            disabled={saving || price.source !== "manuale"}
            onPress={() => savePrice(null)}
            style={({ pressed }) => [
              styles.button,
              (saving || price.source !== "manuale") && styles.buttonDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.buttonLabel}>Usa la media</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.summaryRow}>
        <Summary value={totalKm > 0 ? fmtKm(totalKm) : "—"} unit="km" label="Percorsi" />
        <View style={styles.hairline} />
        <Summary
          value={avgConsumption ? avgConsumption.toFixed(1).replace(".", ",") : "—"}
          unit="l/100"
          label="Consumo"
        />
        <View style={styles.hairline} />
        <Summary
          value={costPerKm ? costPerKm.toFixed(2).replace(".", ",") : "—"}
          unit="€/km"
          label="Costo"
        />
      </View>

      <Text style={[styles.sectionLabel, styles.sectionSpaced]}>Spesa per mese</Text>
      <View style={styles.chartCard}>
        <BarChart
          bars={spendBars}
          width={CHART_W}
          unit="€"
          emptyText="Servono almeno due mesi di rifornimenti rilevati per vedere l'andamento della spesa"
        />
      </View>
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Totale carburante</Text>
        <Text style={styles.totalValue}>{formatEur(totalSpend > 0 ? totalSpend : null)}</Text>
      </View>

      <Text style={[styles.sectionLabel, styles.sectionSpaced]}>Consumo per viaggio</Text>
      <View style={styles.chartCard}>
        <BarChart
          bars={consumptionBars}
          width={CHART_W}
          unit="l/100km"
          emptyText="Servono almeno due viaggi con consumo registrato"
        />
      </View>

      {closed.length > 0 && price.value != null && (
        <>
          <Text style={[styles.sectionLabel, styles.sectionSpaced]}>Costo per viaggio</Text>
          {closed.slice(0, 8).map((trip) => (
            <View key={trip.id} style={styles.row}>
              <Text style={styles.rowLabel}>
                {new Date(trip.started_at).toLocaleDateString("it-IT", {
                  day: "numeric",
                  month: "short",
                })}
              </Text>
              <Text style={styles.rowMeta}>
                {trip.distance_effective_km?.toFixed(1).replace(".", ",") ?? "—"} km
              </Text>
              <Text style={styles.rowValue}>{formatEur(tripCost(trip, price.value))}</Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function Summary({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <View style={styles.summary}>
      <Text style={styles.summaryValue} numberOfLines={1}>
        {value}
        <Text style={styles.summaryUnit}> {unit}</Text>
      </Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

/** Raggruppa per mese di calendario, dal piu' vecchio al piu' recente. */
function monthlyBars<T>(
  items: T[],
  value: (item: T) => number | null,
  when: (item: T) => string
): Bar[] {
  const buckets = new Map<string, number>();
  for (const item of items) {
    const v = value(item);
    if (v == null) continue;
    const d = new Date(when(item));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, (buckets.get(key) ?? 0) + v);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, total]) => {
      const [year, month] = key.split("-").map(Number);
      return {
        key,
        label: new Date(year, month - 1, 1).toLocaleDateString("it-IT", { month: "short" }),
        value: total,
      };
    });
}

/** Accetta sia la virgola italiana sia il punto. */
function parseDecimal(text: string | null): number | null {
  if (!text) return null;
  const n = Number(text.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function sum(values: (number | null)[]): number {
  return values.reduce<number>((acc, v) => acc + (v ?? 0), 0);
}

function fmtKm(value: number): string {
  return Math.round(value).toLocaleString("it-IT");
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl * 2 },
  errorText: { fontSize: 12, color: colors.danger, marginBottom: spacing.sm },

  sectionLabel: {
    fontSize: 9.5,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.42)",
    marginBottom: spacing.sm,
  },
  sectionSpaced: { marginTop: spacing.xl },
  pressed: { opacity: 0.6 },

  priceCard: {
    borderRadius: radius.lg,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: spacing.md,
    gap: spacing.sm + 2,
  },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  priceInput: {
    fontSize: 32,
    fontWeight: "600",
    color: colors.textPrimary,
    letterSpacing: -0.8,
    minWidth: 110,
    padding: 0,
  },
  priceUnit: { fontSize: 13, color: colors.textSecondary },
  priceSource: { fontSize: 11.5, color: "rgba(255,255,255,0.45)", lineHeight: 16 },
  priceActions: { flexDirection: "row", gap: spacing.sm },
  button: {
    paddingVertical: 9,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  buttonPrimary: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent },
  buttonDisabled: { opacity: 0.35 },
  buttonLabel: { fontSize: 12.5, fontWeight: "500", color: colors.textSecondary },
  buttonPrimaryLabel: { fontSize: 12.5, fontWeight: "600", color: colors.accent },

  summaryRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.lg },
  summary: { flex: 1, alignItems: "center", gap: 6 },
  summaryValue: { fontSize: 21, fontWeight: "600", color: colors.textPrimary, letterSpacing: -0.5 },
  summaryUnit: { fontSize: 11, fontWeight: "500", color: colors.textSecondary, letterSpacing: 0 },
  summaryLabel: {
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.4)",
  },
  hairline: { width: 1, height: 26, backgroundColor: "rgba(255,255,255,0.13)" },

  chartCard: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
  },
  totalLabel: { fontSize: 13, color: colors.textSecondary },
  totalValue: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm + 2,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  rowLabel: { fontSize: 13.5, color: colors.textPrimary, width: 70 },
  rowMeta: { flex: 1, fontSize: 11.5, color: "rgba(255,255,255,0.45)" },
  rowValue: { fontSize: 13, fontWeight: "600", color: colors.accent },
});
