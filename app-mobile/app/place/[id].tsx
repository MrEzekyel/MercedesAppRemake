import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import MapView, { Circle, Marker } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, ApiError } from "../../src/api";
import { CloseIcon, PathIcon } from "../../src/components/icons";
import { Eyebrow, HAIRLINE, softColor } from "../../src/components/trips/ui";
import { colors, radius, spacing } from "../../src/theme";
import { addressAt, invalidatePlaces, useBasics, useTrips } from "../../src/trips/data";
import { PLACE_COLORS, PLACE_ICON_PATHS, PLACE_ICONS, RADIUS_CHOICES } from "../../src/trips/places";
import type { PlaceIcon } from "../../src/types";

const ALL = { start: new Date(2000, 0, 1), end: new Date(Date.now() + 86400000) };

/**
 * Salva (o modifica) un luogo: dove, come si chiama, icona, colore e raggio
 * di tolleranza. Il raggio serve perche' si parcheggia spesso un po' piu'
 * in la' della destinazione: tutti i viaggi che arrivano li' dentro, anche
 * quelli passati, prendono il nome del luogo.
 */
export default function PlaceScreen() {
  const params = useLocalSearchParams<{ id: string; lat?: string; lon?: string; name?: string }>();
  const isNew = params.id === "new";
  const insets = useSafeAreaInsets();
  const basics = useBasics();
  const existing = isNew ? null : basics.places.find((p) => p.id === params.id) ?? null;
  const { trips } = useTrips(ALL);

  const start = useMemo(() => {
    if (params.lat && params.lon) return { latitude: Number(params.lat), longitude: Number(params.lon) };
    return null;
  }, [params.lat, params.lon]);

  const [coord, setCoord] = useState<{ latitude: number; longitude: number } | null>(start);
  const [name, setName] = useState(params.name ?? "");
  const [icon, setIcon] = useState<PlaceIcon>("pin");
  const [color, setColor] = useState(PLACE_COLORS[0]);
  const [radiusM, setRadiusM] = useState(300);
  const [address, setAddress] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Valori iniziali: il luogo esistente, oppure la posizione dell'auto.
  useEffect(() => {
    if (loaded) return;
    if (existing) {
      setCoord({ latitude: existing.latitude, longitude: existing.longitude });
      setName(existing.name);
      setIcon(existing.icon);
      setColor(existing.color);
      setRadiusM(existing.radius_m);
      setLoaded(true);
    } else if (isNew && !coord && basics.state?.latitude != null && basics.state.longitude != null) {
      setCoord({ latitude: basics.state.latitude, longitude: basics.state.longitude });
      setLoaded(true);
    } else if (isNew && coord) {
      // Colore non ancora usato, per distinguerlo dagli altri luoghi.
      const used = new Set(basics.places.map((p) => p.color));
      setColor(PLACE_COLORS.find((c) => !used.has(c)) ?? PLACE_COLORS[0]);
      setLoaded(true);
    }
  }, [existing, isNew, coord, basics.state, basics.places, loaded]);

  useEffect(() => {
    if (!coord) return;
    let cancelled = false;
    addressAt(coord.latitude, coord.longitude).then((label) => !cancelled && setAddress(label));
    return () => {
      cancelled = true;
    };
  }, [coord]);

  const matched = useMemo(() => {
    if (!coord) return 0;
    return trips.filter((t) => t.end_lat != null && t.end_lon != null && meters(coord, t.end_lat, t.end_lon) <= radiusM).length;
  }, [trips, coord, radiusM]);

  const save = async () => {
    if (!coord || !name.trim()) return;
    setSaving(true);
    try {
      const body = { name: name.trim(), icon, color, radius_m: radiusM, latitude: coord.latitude, longitude: coord.longitude };
      if (existing) await api.updatePlace(existing.id, body);
      else await api.createPlace(body);
      invalidatePlaces();
      router.back();
    } catch (e) {
      Alert.alert("Luogo non salvato", e instanceof ApiError ? e.message : "Backend non raggiungibile");
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!existing) return;
    Alert.alert(`Eliminare ${existing.name}?`, "I viaggi restano; perdono solo il nome del luogo.", [
      { text: "Annulla", style: "cancel" },
      {
        text: "Elimina",
        style: "destructive",
        onPress: async () => {
          await api.deletePlace(existing.id).catch(() => undefined);
          invalidatePlaces();
          router.back();
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      <View style={styles.map}>
        {coord && (
          <MapView
            style={StyleSheet.absoluteFill}
            initialRegion={{ ...coord, latitudeDelta: 0.012, longitudeDelta: 0.012 }}
            userInterfaceStyle="dark"
            mapType="mutedStandard"
            showsPointsOfInterests={false}
            onPress={(e) => setCoord(e.nativeEvent.coordinate)}
          >
            <Circle center={coord} radius={radiusM} strokeColor={color} fillColor={`${color}26`} strokeWidth={1.5} />
            <Marker coordinate={coord} draggable onDragEnd={(e) => setCoord(e.nativeEvent.coordinate)} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={[styles.pin, { backgroundColor: color }]}>
                <PathIcon d={PLACE_ICON_PATHS[icon]} size={16} color={colors.background} strokeWidth={2} />
              </View>
            </Marker>
          </MapView>
        )}
        <Pressable onPress={() => router.back()} style={[styles.close, { top: insets.top + 8 }]} accessibilityLabel="Chiudi">
          <CloseIcon size={16} color={colors.textPrimary} strokeWidth={1.8} />
        </Pressable>
        <Text style={styles.mapHint}>Tocca la mappa o trascina il punto per spostarlo</Text>
      </View>

      <ScrollView style={styles.sheet} contentContainerStyle={[styles.sheetBody, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.handle} />
        <View style={{ gap: 2 }}>
          <Text style={styles.title}>{existing ? "Modifica luogo" : "Salva come luogo"}</Text>
          {address && <Text style={styles.muted}>{address}</Text>}
        </View>

        <View style={styles.field}>
          <Eyebrow>NOME</Eyebrow>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Casa, Lavoro, Palestra…"
            placeholderTextColor="rgba(255,255,255,0.25)"
            style={styles.input}
            selectionColor={colors.accent}
            maxLength={40}
          />
        </View>

        <View style={styles.field}>
          <Eyebrow>ICONA E COLORE</Eyebrow>
          <View style={styles.icons}>
            {PLACE_ICONS.map((it) => {
              const on = it.icon === icon;
              return (
                <Pressable
                  key={it.icon}
                  onPress={() => setIcon(it.icon)}
                  accessibilityLabel={it.label}
                  style={[styles.iconBtn, on && { borderColor: color, backgroundColor: softColor(color) }]}
                >
                  <PathIcon d={PLACE_ICON_PATHS[it.icon]} size={18} color={on ? color : "rgba(255,255,255,0.7)"} strokeWidth={1.7} />
                </Pressable>
              );
            })}
          </View>
          <View style={styles.colors}>
            {PLACE_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                accessibilityLabel={`Colore ${c}`}
                style={[styles.swatchRing, c === color && { borderColor: c }]}
              >
                <View style={[styles.swatch, { backgroundColor: c }]} />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <View style={styles.row}>
            <Eyebrow>RAGGIO DI RICONOSCIMENTO</Eyebrow>
            <Text style={styles.value}>{radiusM} m</Text>
          </View>
          <View style={styles.radii}>
            {RADIUS_CHOICES.map((r) => (
              <Pressable key={r} onPress={() => setRadiusM(r)} style={[styles.radius, r === radiusM && styles.radiusOn]}>
                <Text style={[styles.radiusText, r === radiusM && styles.radiusTextOn]}>{r} m</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.muted}>
            Conta anche quando parcheggi un po' più in là. In quest'area:{" "}
            <Text style={styles.strong}>{matched} {matched === 1 ? "viaggio passato" : "viaggi passati"}</Text>, verranno
            etichettati subito.
          </Text>
        </View>

        <Pressable
          onPress={save}
          disabled={saving || !name.trim() || !coord}
          style={[styles.save, (saving || !name.trim() || !coord) && styles.disabled]}
        >
          <Text style={styles.saveText}>{saving ? "Salvo…" : existing ? "Salva modifiche" : "Salva luogo"}</Text>
        </Pressable>
        {existing && (
          <Pressable onPress={remove} style={styles.delete}>
            <Text style={styles.deleteText}>Elimina luogo</Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function meters(a: { latitude: number; longitude: number }, lat: number, lon: number): number {
  const r = 6371000;
  const dLat = ((lat - a.latitude) * Math.PI) / 180;
  const dLon = ((lon - a.longitude) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.latitude * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.backgroundBand },
  map: { height: "44%", backgroundColor: colors.backgroundBand },
  close: {
    position: "absolute",
    left: spacing.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(6,9,16,0.8)",
    alignItems: "center",
    justifyContent: "center",
  },
  mapHint: {
    position: "absolute",
    bottom: 34,
    alignSelf: "center",
    fontSize: 11,
    color: colors.textSecondary,
    backgroundColor: "rgba(6,9,16,0.7)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  pin: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: colors.background },

  sheet: {
    flex: 1,
    marginTop: -24,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    backgroundColor: "#0f1523",
    borderTopWidth: 1,
    borderColor: HAIRLINE,
  },
  sheetBody: { paddingHorizontal: 20, paddingTop: 10, gap: 18 },
  handle: { alignSelf: "center", width: 36, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.25)" },
  title: { fontSize: 20, fontWeight: "600", color: colors.textPrimary },
  muted: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  strong: { color: colors.textPrimary },
  field: { gap: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  value: { fontSize: 13, color: colors.textPrimary },
  input: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: HAIRLINE,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    fontSize: 16,
  },
  icons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: HAIRLINE,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  colors: { flexDirection: "row", gap: 10, paddingTop: 4 },
  swatchRing: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: "transparent", alignItems: "center", justifyContent: "center" },
  swatch: { width: 24, height: 24, borderRadius: 12 },
  radii: { flexDirection: "row", gap: 6 },
  radius: { flex: 1, height: 34, borderRadius: radius.pill, borderWidth: 1, borderColor: HAIRLINE, alignItems: "center", justifyContent: "center" },
  radiusOn: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  radiusText: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
  radiusTextOn: { color: colors.background },
  save: { height: 50, borderRadius: radius.pill, backgroundColor: colors.textPrimary, alignItems: "center", justifyContent: "center", marginTop: 4 },
  disabled: { opacity: 0.4 },
  saveText: { fontSize: 16, fontWeight: "600", color: colors.background },
  delete: { height: 44, alignItems: "center", justifyContent: "center" },
  deleteText: { fontSize: 15, color: colors.danger },
});
