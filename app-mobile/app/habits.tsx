import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Circle, Marker, Polyline } from "react-native-maps";
import { PlusIcon } from "../src/components/icons";
import { Heatmap, HBars } from "../src/components/trips/charts";
import { SubPage } from "../src/components/trips/SubPage";
import {
  Dot, EmptyNote, Eyebrow, HAIRLINE, PlaceGlyph, SectionHeader, SmallPill, WARN,
} from "../src/components/trips/ui";
import { colors, radius, spacing } from "../src/theme";
import { useAddresses, useBasics, usePointLabels, useTrips } from "../src/trips/data";
import * as f from "../src/trips/format";
import { PLACE_ICON_PATHS } from "../src/trips/places";
import { closedTrips, distanceBuckets, HEAT_BANDS, heatmap, placeStats, recurringRoute, type Leg } from "../src/trips/stats";
import type { TripSummary } from "../src/types";

const RANGES = [
  { label: "3 mesi", days: 90 },
  { label: "Anno", days: 365 },
  { label: "Tutto", days: 365 * 30 },
];
const DAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

/**
 * Dove vai e quando: mappa dei percorsi con i luoghi salvati, i luoghi con
 * visite e costi, il tragitto ricorrente andata/ritorno, gli orari e la
 * lunghezza dei viaggi. Le mete frequenti non ancora salvate sono proposte
 * come luoghi, con un tocco.
 */
export default function HabitsScreen() {
  const [rangeIndex, setRangeIndex] = useState(0);
  const range = useMemo(() => {
    const end = new Date();
    return { start: new Date(end.getTime() - RANGES[rangeIndex].days * 86400000), end };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeIndex]);
  const { trips } = useTrips(range, { route: true });
  const basics = useBasics();
  const price = basics.price.value;
  const closed = closedTrips(trips);
  const addresses = useAddresses(closed, basics.placeMap, 60);

  const stats = placeStats(closed, basics.places, price);
  const maxVisits = Math.max(1, ...stats.map((s) => s.visits));
  const route = recurringRoute(closed, basics.places, price);
  const unsaved = frequentUnsaved(closed, addresses);
  const labels = usePointLabels(unsaved.filter((s) => !s.address).map((s) => ({ key: s.key, lat: s.lat, lon: s.lon })));
  const suggestions = unsaved.map((s) => ({ ...s, label: s.address ?? labels.get(s.key) ?? "Meta frequente" }));
  const buckets = distanceBuckets(closed);

  return (
    <SubPage
      title="Abitudini e luoghi"
      right={<SmallPill label={RANGES[rangeIndex].label} onPress={() => setRangeIndex((i) => (i + 1) % RANGES.length)} />}
    >
      <TripsMap trips={closed} basics={basics} />

      <View style={styles.block}>
        <SectionHeader title="I tuoi luoghi" right={stats.length ? "arrivi · km · costo" : undefined} />
        {stats.map((s) => (
          <Pressable
            key={s.place.id}
            onPress={() => router.push(`/place/${s.place.id}`)}
            style={({ pressed }) => [styles.placeRow, pressed && styles.pressed]}
          >
            <PlaceGlyph d={PLACE_ICON_PATHS[s.place.icon]} color={s.place.color} />
            <View style={styles.flex}>
              <View style={styles.placeHead}>
                <Text style={styles.body}>{s.place.name}</Text>
                <Text style={styles.muted}>
                  {s.visits} · {f.num(s.km, 0)} km{s.cost != null ? ` · ${f.eur(s.cost, 0)}` : ""}
                </Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${(s.visits / maxVisits) * 100}%`, backgroundColor: s.place.color }]} />
              </View>
            </View>
          </Pressable>
        ))}
        {suggestions.map((s) => (
          <Pressable
            key={s.key}
            onPress={() =>
              router.push({ pathname: "/place/[id]", params: { id: "new", lat: String(s.lat), lon: String(s.lon) } })
            }
            style={({ pressed }) => [styles.placeRow, pressed && styles.pressed]}
          >
            <View style={styles.suggestIcon}>
              <PlusIcon size={16} color={colors.accent} strokeWidth={1.8} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.body}>{s.label}</Text>
              <Text style={styles.muted}>{s.count} arrivi · salvalo come luogo</Text>
            </View>
          </Pressable>
        ))}
        <Pressable
          onPress={() => router.push({ pathname: "/place/[id]", params: { id: "new" } })}
          style={({ pressed }) => [styles.placeRow, pressed && styles.pressed]}
        >
          <View style={[styles.suggestIcon, styles.dashed]}>
            <PlusIcon size={16} color={colors.accent} strokeWidth={1.8} />
          </View>
          <Text style={styles.link}>Salva un nuovo luogo</Text>
        </Pressable>
      </View>

      {route ? (
        <RouteCard out={route.out} back={route.back} />
      ) : basics.places.length < 2 ? (
        <EmptyNote text="Salva almeno due luoghi, per esempio Casa e Lavoro, per vedere il tragitto che fai più spesso." />
      ) : null}

      <View style={styles.block}>
        <SectionHeader title="Quando guidi" />
        <Heatmap grid={heatmap(closed)} rows={DAYS} cols={HEAT_BANDS.map((b) => b[2])} />
        <Text style={styles.muted}>Più chiaro = più viaggi in quella fascia oraria</Text>
      </View>

      <View style={styles.block}>
        <SectionHeader title="Quanto sono lunghi" />
        <HBars items={buckets.map((b, i) => ({ label: b.label, value: b.count, highlight: i === 0 }))} />
        {buckets[0].count > 0 && closed.length > 0 && (
          <Text style={styles.muted}>
            Il {Math.round((buckets[0].count / closed.length) * 100)}% dei viaggi è sotto i 5 km
            {buckets[0].lPer100 != null ? `, dove consumi ${f.num(buckets[0].lPer100)} L/100 km` : ""}.
          </Text>
        )}
      </View>
    </SubPage>
  );
}

/** Mappa scura a tutta larghezza: percorsi colorati per meta, luoghi col loro raggio, l'auto dov'e' ora. */
function TripsMap({ trips, basics }: { trips: TripSummary[]; basics: ReturnType<typeof useBasics> }) {
  const lines = trips.filter((t) => t.route.length >= 2);
  const points: { latitude: number; longitude: number }[] = [
    ...lines.flatMap((t) => t.route.map(([lon, lat]) => ({ latitude: lat, longitude: lon }))),
    ...basics.places.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
  ];
  const car = basics.state?.latitude != null && basics.state.longitude != null
    ? { latitude: basics.state.latitude, longitude: basics.state.longitude }
    : null;
  if (car) points.push(car);
  if (points.length === 0) return null;
  const region = fit(points);
  // Auto parcheggiata in un luogo salvato: lo dice l'etichetta del luogo,
  // invece di un secondo segnaposto sopra quello.
  const carPlace = car
    ? basics.places.find((p) => distanceM(car, p.latitude, p.longitude) <= p.radius_m) ?? null
    : null;

  return (
    <View style={styles.mapWrap}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        userInterfaceStyle="dark"
        mapType="mutedStandard"
        showsPointsOfInterests={false}
        showsBuildings={false}
        pitchEnabled={false}
        toolbarEnabled={false}
      >
        {lines.map((t) => {
          const place = t.end_place_id ? basics.placeMap.get(t.end_place_id) : null;
          return (
            <Polyline
              key={t.id}
              coordinates={t.route.map(([lon, lat]) => ({ latitude: lat, longitude: lon }))}
              strokeColor={place ? `${place.color}B3` : "rgba(255,255,255,0.35)"}
              strokeWidth={place ? 2.5 : 1.5}
              lineCap="round"
              lineJoin="round"
            />
          );
        })}
        {basics.places.map((p) => (
          <Circle
            key={`c${p.id}`}
            center={{ latitude: p.latitude, longitude: p.longitude }}
            radius={p.radius_m}
            strokeColor={p.color}
            fillColor={`${p.color}22`}
            strokeWidth={1}
          />
        ))}
        {basics.places.map((p) => (
          <Marker key={p.id} coordinate={{ latitude: p.latitude, longitude: p.longitude }} onPress={() => router.push(`/place/${p.id}`)}>
            <View style={styles.pin}>
              {p.id === carPlace?.id ? <CarThumb heading={basics.state?.heading ?? 0} small /> : <Dot color={p.color} size={12} />}
              <Text style={styles.pinText}>{p.id === carPlace?.id ? `${p.name} · auto qui` : p.name}</Text>
            </View>
          </Marker>
        ))}
        {car && !carPlace && (
          <Marker coordinate={car} anchor={{ x: 0.5, y: 0.5 }}>
            <CarThumb heading={basics.state?.heading ?? 0} />
          </Marker>
        )}
      </MapView>
    </View>
  );
}

/** L'auto vista dall'alto (la foto di Info veicolo), ruotata come e' parcheggiata. */
function CarThumb({ heading, small }: { heading: number; small?: boolean }) {
  return (
    <View style={[styles.car, small && styles.carSmall, { transform: [{ rotate: `${heading}deg` }] }]}>
      <Image
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source={require("../assets/vehicle/top.jpg")}
        style={small ? styles.carImageSmall : styles.carImage}
      />
    </View>
  );
}

function RouteCard({ out, back }: { out: Leg; back: Leg | null }) {
  const legs = back ? [out, back] : [out];
  const maxSec = Math.max(...legs.map((l) => l.maxSeconds), 1);
  const diffMin = back ? Math.round((back.avgSeconds - out.avgSeconds) / 60) : 0;
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={{ gap: 4 }}>
          <Eyebrow>TRAGITTO RICORRENTE</Eyebrow>
          <View style={styles.routeTitle}>
            <Dot color={out.from.color} size={8} />
            <Text style={styles.routeName}>{out.from.name}</Text>
            <Text style={styles.routeArrow}>{back ? "⇄" : "→"}</Text>
            <Dot color={out.to.color} size={8} />
            <Text style={styles.routeName}>{out.to.name}</Text>
          </View>
        </View>
        <Text style={styles.muted}>{legs.reduce((a, l) => a + l.count, 0)} volte</Text>
      </View>

      <View style={styles.legRow}>
        <Text style={styles.legLabel} />
        {legs.map((l, i) => (
          <Eyebrow key={i} color={colors.textSecondary} style={styles.legCell}>
            {i === 0 ? "ANDATA" : "RITORNO"} · {l.typicalStart}
          </Eyebrow>
        ))}
      </View>
      <View style={styles.legRow}>
        <Text style={styles.legLabel}>Tempo</Text>
        {legs.map((l, i) => (
          <View key={i} style={[styles.legCell, { gap: 5 }]}>
            <Text style={styles.legValueBig}>{Math.round(l.avgSeconds / 60)} min</Text>
            <View style={styles.legTrack}>
              <View
                style={[
                  styles.legFill,
                  {
                    left: `${(l.minSeconds / maxSec) * 100}%`,
                    width: `${Math.max(4, ((l.maxSeconds - l.minSeconds) / maxSec) * 100)}%`,
                    backgroundColor: i === 0 ? WARN : colors.accent,
                  },
                ]}
              />
            </View>
            <Text style={styles.legRange}>{Math.round(l.minSeconds / 60)}–{Math.round(l.maxSeconds / 60)} min</Text>
          </View>
        ))}
      </View>
      {[
        { label: "Distanza", value: (l: Leg) => `${f.km(l.avgKm)} km` },
        { label: "Consumo", value: (l: Leg) => (l.lPer100 != null ? `${f.num(l.lPer100)} L/100` : "—") },
        { label: "Costo", value: (l: Leg) => f.eur(l.avgCost) },
      ].map((row) => (
        <View key={row.label} style={styles.legRow}>
          <Text style={styles.legLabel}>{row.label}</Text>
          {legs.map((l, i) => (
            <Text key={i} style={[styles.legValue, styles.legCell]}>{row.value(l)}</Text>
          ))}
        </View>
      ))}
      {back && Math.abs(diffMin) >= 2 && (
        <Text style={styles.muted}>
          {diffMin > 0 ? `Il ritorno dura in media ${diffMin} minuti in più.` : `L'andata dura in media ${-diffMin} minuti in più.`}
        </Text>
      )}
    </View>
  );
}

/**
 * Mete frequenti non ancora salvate: arrivi raggruppati per via (o per
 * cella di ~100 m se l'indirizzo non c'e'), almeno 3.
 */
function frequentUnsaved(trips: TripSummary[], addresses: Map<string, string>) {
  // Celle di ~100 m: arrivi nello stesso isolato contano come la stessa meta.
  const groups = new Map<string, { address: string | null; lat: number; lon: number; count: number }>();
  for (const t of trips) {
    if (t.end_place_id || t.end_lat == null || t.end_lon == null) continue;
    const key = `${t.end_lat.toFixed(3)},${t.end_lon.toFixed(3)}`;
    const g = groups.get(key) ?? { address: null, lat: t.end_lat, lon: t.end_lon, count: 0 };
    g.address = g.address ?? t.end_address ?? addresses.get(`${t.id}:end`) ?? null;
    g.count += 1;
    groups.set(key, g);
  }
  return [...groups.entries()]
    .filter(([, g]) => g.count >= 3)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 3)
    .map(([key, g]) => ({ key, ...g }));
}

function distanceM(a: { latitude: number; longitude: number }, lat: number, lon: number): number {
  const dLat = ((lat - a.latitude) * Math.PI) / 180;
  const dLon = ((lon - a.longitude) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.latitude * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

function fit(points: { latitude: number; longitude: number }[]) {
  const lats = points.map((p) => p.latitude);
  const lons = points.map((p) => p.longitude);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(0.02, (maxLat - minLat) * 1.4),
    longitudeDelta: Math.max(0.02, (maxLon - minLon) * 1.4),
  };
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  block: { gap: 12 },
  body: { fontSize: 15, color: colors.textPrimary },
  muted: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  link: { fontSize: 15, color: colors.accent },

  mapWrap: { height: 330, marginHorizontal: -spacing.md, overflow: "hidden", backgroundColor: colors.backgroundBand },
  pin: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: "rgba(6,9,16,0.85)",
  },
  pinText: { fontSize: 11, fontWeight: "600", color: colors.textPrimary },
  car: {
    width: 26,
    height: 48,
    borderRadius: 9,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(79,143,209,0.8)",
  },
  // Ritaglio della foto dall'alto: l'auto occupa il terzo centrale dello scatto.
  carImage: { position: "absolute", left: -26, top: -46, width: 78, height: 140 },
  carSmall: { width: 14, height: 26, borderRadius: 5, borderWidth: 1 },
  carImageSmall: { position: "absolute", left: -14, top: -25, width: 42, height: 75 },

  placeRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4, minHeight: 44 },
  placeHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  track: { height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.08)", marginTop: 6, overflow: "hidden" },
  fill: { height: 4, borderRadius: 2 },
  suggestIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  dashed: { backgroundColor: "transparent", borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(79,143,209,0.6)" },

  card: {
    padding: spacing.md,
    paddingVertical: 18,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: HAIRLINE,
    gap: 16,
  },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  routeTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  routeName: { fontSize: 18, fontWeight: "600", color: colors.textPrimary },
  routeArrow: { fontSize: 16, color: colors.textTertiary },
  legRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginTop: -4 },
  legLabel: { width: 70, fontSize: 13, color: colors.textTertiary, paddingTop: 2 },
  legCell: { flex: 1 },
  legValueBig: { fontSize: 17, color: colors.textPrimary },
  legValue: { fontSize: 15, color: colors.textPrimary },
  legTrack: { height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.08)" },
  legFill: { position: "absolute", height: 4, borderRadius: 2 },
  legRange: { fontSize: 11, color: colors.textTertiary },
});
