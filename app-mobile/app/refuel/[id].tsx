import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from "react-native";
import { api, ApiError, type NearbyFuelPrice } from "../../src/api";
import { Eyebrow, HAIRLINE } from "../../src/components/trips/ui";
import { colors, radius, spacing } from "../../src/theme";
import * as f from "../../src/trips/format";
import { goBack } from "../../src/trips/nav";
import type { Refuel } from "../../src/types";

/** Accetta sia la virgola italiana sia il punto. */
const parse = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const show = (n: number, d: number) => n.toFixed(d).replace(".", ",");

/**
 * Conferma (o correzione) di un rifornimento.
 *
 * Al distributore si sa quanto si e' speso e il prezzo al litro scritto
 * sulla colonnina, non i litri esatti: si inseriscono quei due numeri e i
 * litri li calcola l'app. La stima dell'auto (dal salto del serbatoio)
 * resta come confronto, perche' spesso sbaglia.
 */
export default function RefuelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [refuel, setRefuel] = useState<Refuel | null>(null);
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [priceTouched, setPriceTouched] = useState(false);
  const [fullTank, setFullTank] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [nearby, setNearby] = useState<NearbyFuelPrice[]>([]);

  useEffect(() => {
    api.listRefuels({ limit: 200 }).then((rows) => {
      const found = rows.find((r) => r.id === id) ?? null;
      setRefuel(found);
      if (!found) return;
      if (found.cost_eur != null) setCost(show(found.cost_eur, 2));
      if (found.status === "confirmed" && found.price_per_liter != null) {
        setPrice(show(found.price_per_liter, 3));
        setPriceTouched(true);
      }
      // Pieno se il serbatoio e' arrivato quasi al massimo; se gia'
      // confermato, vale la scelta fatta allora.
      setFullTank(found.status === "confirmed" ? found.full_tank : (found.fuel_level_after_pct ?? 0) >= 95);
      setNotes(found.notes ?? "");
    });
  }, [id]);

  useEffect(() => {
    // Posizione attuale dell'auto come approssimazione di dove e' avvenuto
    // il rifornimento: per suggerire il prezzo basta.
    api
      .getState()
      .then((rows) => rows[0]?.vin)
      .then((vin) => (vin ? api.getNearbyFuelPrices(vin, 8, 3) : []))
      .then(setNearby)
      .catch(() => setNearby([]));
  }, []);

  // Il prezzo del distributore piu' vicino come proposta, finche' non lo si tocca.
  useEffect(() => {
    if (!priceTouched && nearby[0]) setPrice(show(nearby[0].price, 3));
  }, [nearby, priceTouched]);

  const costValue = parse(cost);
  const priceValue = parse(price);
  const liters = costValue != null && priceValue != null ? costValue / priceValue : null;

  async function onConfirm() {
    if (costValue == null || priceValue == null || liters == null) {
      Alert.alert("Dati mancanti", "Inserisci quanto hai speso e il prezzo al litro.");
      return;
    }
    if (priceValue < 0.8 || priceValue > 4) {
      Alert.alert("Prezzo strano", `${show(priceValue, 3)} €/L sembra fuori scala: controlla il prezzo al litro.`);
      return;
    }
    setSaving(true);
    try {
      await api.confirmRefuel(id, {
        liters: Math.round(liters * 100) / 100,
        cost_eur: costValue,
        full_tank: fullTank,
        notes: notes.trim() || null,
      });
      goBack();
    } catch (e) {
      Alert.alert("Errore", e instanceof ApiError ? e.message : "Backend non raggiungibile");
    } finally {
      setSaving(false);
    }
  }

  function onDiscard() {
    Alert.alert("Eliminare questo rifornimento?", "Se non era un rifornimento vero (es. sensore rumoroso).", [
      { text: "Annulla", style: "cancel" },
      {
        text: "Elimina",
        style: "destructive",
        onPress: async () => {
          await api.deleteRefuel(id);
          goBack();
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

  const confirmed = refuel.status === "confirmed";
  const date = new Date(refuel.detected_at);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 4 }}>
          <Eyebrow>{`${f.weekday(date)} ${f.shortDate(date)} · ${f.time(date)}`.toUpperCase()}</Eyebrow>
          <Text style={styles.title}>{confirmed ? "Modifica rifornimento" : "Conferma rifornimento"}</Text>
          <Text style={styles.muted}>
            Serbatoio {Math.round(refuel.fuel_level_before_pct ?? 0)}% → {Math.round(refuel.fuel_level_after_pct ?? 0)}%
            {refuel.liters_estimated ? ` · stima dell'auto ${show(refuel.liters_estimated, 1)} L` : ""}
          </Text>
        </View>

        <View style={styles.pair}>
          <View style={styles.field}>
            <Eyebrow>SPESA</Eyebrow>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={cost}
                onChangeText={setCost}
                keyboardType="decimal-pad"
                placeholder="20,00"
                placeholderTextColor="rgba(255,255,255,0.25)"
                selectionColor={colors.accent}
              />
              <Text style={styles.unit}>€</Text>
            </View>
          </View>
          <View style={styles.field}>
            <Eyebrow>PREZZO AL LITRO</Eyebrow>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={price}
                onChangeText={(t) => {
                  setPrice(t);
                  setPriceTouched(true);
                }}
                keyboardType="decimal-pad"
                placeholder="1,799"
                placeholderTextColor="rgba(255,255,255,0.25)"
                selectionColor={colors.accent}
              />
              <Text style={styles.unit}>€/L</Text>
            </View>
          </View>
        </View>

        {nearby.length > 0 && (
          <View style={{ gap: 8 }}>
            <Eyebrow>PREZZI DEI DISTRIBUTORI VICINI</Eyebrow>
            <View style={styles.chips}>
              {nearby.map((station) => {
                const on = priceValue != null && Math.abs(priceValue - station.price) < 0.0005;
                return (
                  <Pressable
                    key={station.station_id}
                    onPress={() => {
                      setPrice(show(station.price, 3));
                      setPriceTouched(true);
                    }}
                    style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
                  >
                    <Text style={styles.chipPrice}>{show(station.price, 3)} €</Text>
                    <Text style={styles.chipMeta} numberOfLines={1}>
                      {station.brand ?? station.name ?? "Distributore"} · {fmtDistance(station.distance_m)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <View style={styles.result}>
          <Eyebrow>LITRI</Eyebrow>
          <Text style={styles.resultValue}>{liters != null ? `${show(liters, 2)} L` : "—"}</Text>
          <Text style={styles.muted}>
            {liters != null && refuel.liters_estimated
              ? `Calcolati da spesa e prezzo. L'auto aveva stimato ${show(refuel.liters_estimated, 1)} L.`
              : "Calcolati da spesa e prezzo al litro."}
          </Text>
        </View>

        <View style={styles.switchRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.body}>Pieno completo</Text>
            <Text style={styles.muted}>Serve a calcolare il consumo reale fra due pieni.</Text>
          </View>
          <Switch value={fullTank} onValueChange={setFullTank} trackColor={{ true: colors.accent }} />
        </View>

        <View style={styles.field}>
          <Eyebrow>NOTE</Eyebrow>
          <TextInput
            style={[styles.input, styles.noteInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Distributore, self o servito…"
            placeholderTextColor="rgba(255,255,255,0.25)"
            selectionColor={colors.accent}
          />
        </View>

        <Pressable style={[styles.confirm, (saving || liters == null) && styles.disabled]} onPress={onConfirm} disabled={saving}>
          <Text style={styles.confirmText}>{saving ? "Salvo…" : confirmed ? "Salva modifiche" : "Conferma"}</Text>
        </Pressable>
        <Pressable style={styles.discard} onPress={onDiscard}>
          <Text style={styles.discardText}>{confirmed ? "Elimina rifornimento" : "Non era un rifornimento"}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function fmtDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.lg, gap: 22, paddingBottom: 60 },
  title: { fontSize: 24, fontWeight: "600", color: colors.textPrimary, letterSpacing: -0.3 },
  body: { fontSize: 15, color: colors.textPrimary },
  muted: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  pressed: { opacity: 0.6 },
  pair: { flexDirection: "row", gap: 12 },
  field: { flex: 1, gap: 8 },
  inputRow: { flexDirection: "row", alignItems: "center" },
  input: {
    flex: 1,
    height: 52,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: HAIRLINE,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: "300",
  },
  noteInput: { fontSize: 15, fontWeight: "400", height: 46 },
  unit: { position: "absolute", right: 14, fontSize: 13, color: colors.textTertiary },
  chips: { flexDirection: "row", gap: 8 },
  chip: {
    flex: 1,
    gap: 2,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: HAIRLINE,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipPrice: { fontSize: 15, fontWeight: "500", color: colors.textPrimary },
  chipMeta: { fontSize: 11, color: colors.textTertiary },
  result: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: HAIRLINE,
    backgroundColor: colors.surface,
    gap: 4,
  },
  resultValue: { fontSize: 34, fontWeight: "200", color: colors.textPrimary, letterSpacing: -1 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  confirm: { height: 50, borderRadius: radius.pill, backgroundColor: colors.textPrimary, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.4 },
  confirmText: { fontSize: 16, fontWeight: "600", color: colors.background },
  discard: { height: 44, alignItems: "center", justifyContent: "center" },
  discardText: { fontSize: 14, color: colors.danger },
});
