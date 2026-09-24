import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Dimensions, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { api, ApiError } from "../../src/api";
import { SubPage } from "../../src/components/trips/SubPage";
import { Dot, Eyebrow, GOOD, HAIRLINE, HAIRLINE_SOFT, StatGrid, WARN } from "../../src/components/trips/ui";
import { colors, radius, spacing } from "../../src/theme";
import { useAddresses, useBasics, useTrips } from "../../src/trips/data";
import * as f from "../../src/trips/format";
import { endpoint } from "../../src/trips/places";
import { totals } from "../../src/trips/stats";
import type { TripDetail } from "../../src/types";

const { width: SCREEN_W } = Dimensions.get("window");
const MAP_H = 560;
const TAGS = ["Personale", "Lavoro", "Commissione"];

/**
 * Un viaggio per intero. La mappa sta dietro header e saluto, a tutta
 * larghezza: il percorso e' disegnato dai punti GPS raccolti durante la
 * marcia (pochi, quindi la linea e' approssimata). Sotto, i numeri, il
 * confronto con la tua media, l'auto prima e dopo, etichetta e nota.
 */
export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const basics = useBasics();
  const price = basics.price.value;

  // Media degli ultimi 90 giorni: il metro con cui giudicare questo viaggio.
  const recent = useMemo(() => {
    const end = new Date();
    return { start: new Date(end.getTime() - 90 * 86400000), end };
  }, []);
  const { trips: last90 } = useTrips(recent);
  const avg = totals(last90, price).lPer100;

  useEffect(() => {
    if (!id) return;
    api
      .getTrip(id)
      .then((t) => {
        setTrip(t);
        setNote(t.note ?? "");
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Backend non raggiungibile"));
  }, [id]);

  const one = useMemo(() => (trip ? [trip] : []), [trip]);
  const addresses = useAddresses(one, basics.placeMap);

  const update = async (body: Parameters<typeof api.updateTrip>[1]) => {
    if (!trip) return;
    setTrip({ ...trip, ...body });
    try {
      setTrip(await api.updateTrip(trip.id, body));
    } catch {
      setError("Modifica non salvata");
    }
  };

  if (!trip) {
    return (
      <SubPage title="Viaggio">
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={colors.accent} style={styles.loading} />}
      </SubPage>
    );
  }

  const from = endpoint(trip, "start", basics.placeMap, addresses);
  const to = endpoint(trip, "end", basics.placeMap, addresses);
  const cost = price != null && trip.fuel_used_l != null ? trip.fuel_used_l * price : null;
  const vsAvg = trip.l_per_100km != null && avg != null ? trip.l_per_100km / avg - 1 : null;
  const tone = vsAvg == null ? null : vsAvg > 0.05 ? "warn" : vsAvg < -0.05 ? "good" : null;
  const start = new Date(trip.started_at);
  const dateLine = `${f.weekday(start)} ${f.shortDate(start)} · ${f.time(trip.started_at)}${trip.ended_at ? ` – ${f.time(trip.ended_at)}` : ""}`;

  return (
    <SubPage
      title=""
      backdrop={<RouteBackdrop trip={trip} fromColor={from.color} toColor={to.color} />}
    >
      <View style={styles.mapSpace} pointerEvents="none" />

      <View style={styles.head}>
        <Eyebrow>{dateLine.toUpperCase()}</Eyebrow>
        <View style={styles.titleRow}>
          {from.color && <Dot color={from.color} size={8} />}
          <Text style={styles.title}>{from.name}</Text>
          <Text style={styles.arrow}>→</Text>
          {to.color && <Dot color={to.color} size={8} />}
          <Text style={styles.title}>{to.name}</Text>
        </View>
        {!to.place && trip.end_lat != null && trip.end_lon != null && (
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/place/[id]",
                params: { id: "new", lat: String(trip.end_lat), lon: String(trip.end_lon), name: "" },
              })
            }
            hitSlop={6}
          >
            <Text style={styles.link}>Salva la destinazione come luogo</Text>
          </Pressable>
        )}
      </View>

      <StatGrid
        columns={3}
        cells={[
          { label: "DISTANZA", value: f.km(trip.distance_effective_km), unit: "km" },
          { label: "DURATA", value: f.duration(trip.duration_s) },
          { label: "MEDIA", value: f.num(trip.avg_speed_kmh, 0), unit: "km/h" },
          { label: "CARBURANTE", value: f.num(trip.fuel_used_l, 2), unit: "L" },
          { label: "COSTO", value: cost != null ? f.num(cost, 2) : "—", unit: cost != null ? "€" : undefined },
          { label: "L/100 KM", value: f.num(trip.l_per_100km) },
        ]}
      />

      {vsAvg != null && avg != null && trip.l_per_100km != null && (
        <View style={[styles.compare, tone === "warn" && styles.compareWarn, tone === "good" && styles.compareGood]}>
          <View style={styles.row}>
            <Text style={styles.body}>Consumo rispetto alla tua media</Text>
            <Text style={[styles.strong, { color: tone === "warn" ? WARN : tone === "good" ? GOOD : colors.textPrimary }]}>
              {f.pct(vsAvg)}
            </Text>
          </View>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${Math.min(100, (avg / 12) * 100)}%`, backgroundColor: "rgba(255,255,255,0.3)" }]} />
            <View
              style={[
                styles.barFill,
                {
                  width: `${Math.min(100, (trip.l_per_100km / 12) * 100)}%`,
                  backgroundColor:
                    tone === "warn" ? "rgba(224,166,60,0.55)" : tone === "good" ? "rgba(52,199,89,0.55)" : "rgba(79,143,209,0.55)",
                },
              ]}
            />
            <View style={[styles.tick, { left: `${Math.min(100, (avg / 12) * 100)}%` }]} />
          </View>
          <Text style={styles.muted}>
            Media degli ultimi 3 mesi {f.num(avg)} · questo viaggio {f.num(trip.l_per_100km)}
            {vsAvg > 0.15 && (trip.distance_effective_km ?? 0) < 10 ? ". Tragitto breve: motore freddo per buona parte." : "."}
          </Text>
        </View>
      )}

      <View>
        <Eyebrow style={styles.eyebrowGap}>L'AUTO, PRIMA E DOPO</Eyebrow>
        <BeforeAfter label="Contachilometri" a={fmtInt(trip.odometer_start)} b={fmtInt(trip.odometer_end)} />
        <BeforeAfter
          label="Serbatoio"
          a={trip.fuel_level_start_pct != null ? `${Math.round(trip.fuel_level_start_pct)}%` : "—"}
          b={trip.fuel_level_end_pct != null ? `${Math.round(trip.fuel_level_end_pct)}%` : "—"}
        />
        <BeforeAfter
          label="Autonomia"
          a={trip.range_start_km != null ? `${trip.range_start_km} km` : "—"}
          b={trip.range_end_km != null ? `${trip.range_end_km} km` : "—"}
        />
      </View>

      <View style={styles.editBlock}>
        <Eyebrow>ETICHETTA</Eyebrow>
        <View style={styles.tags}>
          {[...TAGS, ...(trip.tag && !TAGS.includes(trip.tag) ? [trip.tag] : [])].map((t) => {
            const on = trip.tag === t;
            return (
              <Pressable key={t} onPress={() => update({ tag: on ? null : t })} style={[styles.tag, on && styles.tagOn]}>
                <Text style={[styles.tagText, on && styles.tagTextOn]}>{t}</Text>
              </Pressable>
            );
          })}
        </View>
        <Eyebrow style={styles.noteLabel}>NOTE</Eyebrow>
        <TextInput
          value={note}
          onChangeText={setNote}
          onEndEditing={() => note !== (trip.note ?? "") && update({ note: note.trim() || null })}
          placeholder="Aggiungi una nota al viaggio"
          placeholderTextColor="rgba(255,255,255,0.3)"
          multiline
          style={styles.note}
          selectionColor={colors.accent}
          maxLength={500}
        />
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    </SubPage>
  );
}

function BeforeAfter({ label, a, b }: { label: string; a: string; b: string }) {
  if (a === "—" && b === "—") return null;
  return (
    <View style={styles.ba}>
      <Text style={[styles.muted, styles.flex]}>{label}</Text>
      <Text style={styles.baValue}>{a}</Text>
      <Text style={styles.baArrow}>→</Text>
      <Text style={styles.baValue}>{b}</Text>
    </View>
  );
}

const fmtInt = (v: number | null) => (v == null ? "—" : Math.round(v).toLocaleString("it-IT"));

/** Mappa del percorso dietro header e saluto, sfumata in alto e in basso. */
/** I punti hanno il colore del luogo, come i pallini del titolo sotto. */
function RouteBackdrop({ trip, fromColor, toColor }: { trip: TripDetail; fromColor: string | null; toColor: string | null }) {
  const map = useRef<MapView>(null);
  const coords = trip.route.map(([longitude, latitude]) => ({ latitude, longitude }));
  if (coords.length === 0 && trip.start_lat != null && trip.start_lon != null) {
    coords.push({ latitude: trip.start_lat, longitude: trip.start_lon });
  }
  if (coords.length === 0) return null;
  const fitRoute = () =>
    map.current?.fitToCoordinates(coords, { edgePadding: { top: 250, bottom: 130, left: 70, right: 70 }, animated: false });

  return (
    <View style={styles.backdrop} pointerEvents="none">
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...coords[0], latitudeDelta: 0.05, longitudeDelta: 0.05 }}
        onMapReady={fitRoute}
        userInterfaceStyle="dark"
        mapType="mutedStandard"
        showsPointsOfInterests={false}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {coords.length >= 2 && (
          <>
            <Polyline coordinates={coords} strokeColor="rgba(79,143,209,0.25)" strokeWidth={9} lineCap="round" lineJoin="round" />
            <Polyline coordinates={coords} strokeColor={colors.accent} strokeWidth={3.5} lineCap="round" lineJoin="round" />
          </>
        )}
        <Marker coordinate={coords[0]} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={[styles.endpoint, { backgroundColor: fromColor ?? colors.accent }]} />
        </Marker>
        {coords.length >= 2 && (
          <Marker coordinate={coords[coords.length - 1]} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={[styles.endpoint, { backgroundColor: toColor ?? colors.textPrimary }]} />
          </Marker>
        )}
      </MapView>
      {/* Mappa appena scurita e sfumata: i nomi delle vie non devono
          competere con header, saluto e titolo del viaggio. */}
      <View style={styles.dim} />
      <LinearGradient colors={[colors.background, "rgba(6,9,16,0)"]} locations={[0.62, 1]} style={styles.fadeTop} />
      <LinearGradient colors={["rgba(6,9,16,0)", colors.background]} style={styles.fadeBottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { marginTop: 40 },
  backdrop: { position: "absolute", top: 0, left: 0, width: SCREEN_W, height: MAP_H },
  dim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(6,9,16,0.16)" },
  fadeTop: { position: "absolute", top: 0, left: 0, right: 0, height: 330 },
  fadeBottom: { position: "absolute", bottom: 0, left: 0, right: 0, height: 200 },
  endpoint: { width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: colors.background },

  mapSpace: { height: 210, marginTop: -26 },

  head: { gap: 4 },
  titleRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  title: { fontSize: 26, fontWeight: "600", color: colors.textPrimary, letterSpacing: -0.3 },
  arrow: { fontSize: 22, color: colors.textTertiary },
  link: { fontSize: 14, color: colors.accent, marginTop: 2 },
  body: { fontSize: 14, color: colors.textPrimary },
  strong: { fontSize: 14, fontWeight: "600" },
  muted: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  error: { fontSize: 12, color: colors.danger },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  eyebrowGap: { paddingBottom: 8 },

  compare: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: HAIRLINE,
    gap: 12,
  },
  compareWarn: { backgroundColor: "rgba(224,166,60,0.08)", borderColor: "rgba(224,166,60,0.25)" },
  compareGood: { backgroundColor: "rgba(52,199,89,0.08)", borderColor: "rgba(52,199,89,0.25)" },
  bar: { height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.08)" },
  barFill: { position: "absolute", left: 0, height: 8, borderRadius: 4 },
  tick: { position: "absolute", top: -4, width: 2, height: 16, marginLeft: -1, backgroundColor: colors.textPrimary },

  ba: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderTopWidth: 1, borderTopColor: HAIRLINE_SOFT },
  baValue: { width: 84, textAlign: "right", fontSize: 14, color: colors.textPrimary },
  baArrow: { width: 20, textAlign: "center", fontSize: 14, color: colors.textTertiary },

  editBlock: { gap: 10 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { height: 34, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: HAIRLINE, justifyContent: "center" },
  tagOn: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  tagText: { fontSize: 13, color: colors.textPrimary },
  tagTextOn: { color: colors.background, fontWeight: "600" },
  noteLabel: { paddingTop: 6 },
  note: {
    minHeight: 64,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: HAIRLINE,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    fontSize: 15,
    textAlignVertical: "top",
  },
});
