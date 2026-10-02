import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Bars, HBars } from "../../src/components/trips/charts";
import { CONTENT_W, SubPage } from "../../src/components/trips/SubPage";
import { TripRow } from "../../src/components/trips/TripRow";
import { TripsMap } from "../../src/components/trips/TripsMap";
import { tripCost } from "../../src/fuel";
import {
  Dot, EmptyNote, Eyebrow, HAIRLINE_SOFT, PeriodPicker, PlaceGlyph, SectionHeader, SmallPill, StatGrid,
} from "../../src/components/trips/ui";
import { colors, radius } from "../../src/theme";
import { addressAt, useAddresses, useBasics, usePeriodTrips } from "../../src/trips/data";
import * as f from "../../src/trips/format";
import { axisLabelsFor, bucketName, bucketsFor, perBucket, type PeriodKind } from "../../src/trips/period";
import { endpoint, PLACE_ICON_PATHS } from "../../src/trips/places";
import { closedTrips, delta, HEAT_BANDS, series, totals } from "../../src/trips/stats";
import type { TripSummary } from "../../src/types";

const KINDS: PeriodKind[] = ["day", "week", "month", "quarter", "year", "all"];
const FIRST_TRIPS = 6;

/**
 * Un luogo salvato: tutti i viaggi che ci arrivano o ne partono, sulla sua
 * mappa, con i numeri (arrivi, km, tempo, consumo, costo), gli arrivi nel
 * tempo, da dove arrivi e dove vai dopo, a che ora ci arrivi.
 */
export default function PlaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [kind, setKind] = useState<PeriodKind>("quarter");
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const basics = useBasics();
  const price = basics.price.value;
  const place = basics.placeMap.get(id ?? "") ?? null;
  const { period, trips, prevTrips, prevRange } = usePeriodTrips(kind, offset, { route: true });

  const [address, setAddress] = useState<string | null>(null);
  useEffect(() => {
    if (place) addressAt(place.latitude, place.longitude).then(setAddress);
  }, [place]);

  const involves = (t: TripSummary) => t.start_place_id === id || t.end_place_id === id;
  const mine = useMemo(() => closedTrips(trips).filter(involves), [trips, id]); // eslint-disable-line react-hooks/exhaustive-deps
  const arrivals = mine.filter((t) => t.end_place_id === id);
  const departures = mine.filter((t) => t.start_place_id === id);
  const prevArrivals = closedTrips(prevTrips).filter((t) => t.end_place_id === id);
  const addresses = useAddresses(mine, basics.placeMap);

  const all = totals(mine, price);
  const overall = totals(trips, price);
  const buckets = useMemo(() => bucketsFor(period), [period]);
  const perBucketArrivals = series(arrivals, buckets, "trips", price);
  const arrivalsDelta = prevRange ? delta(arrivals.length, prevArrivals.length) : null;
  const consVs = all.lPer100 != null && overall.lPer100 != null ? all.lPer100 / overall.lPer100 - 1 : null;

  const origins = rank(arrivals, (t) => endpoint(t, "start", basics.placeMap, addresses));
  const nexts = rank(departures, (t) => endpoint(t, "end", basics.placeMap, addresses));
  const hours = HEAT_BANDS.map(([lo, hi, label]) => ({
    label,
    value: arrivals.filter((t) => {
      const h = new Date(t.ended_at ?? t.started_at).getHours();
      return h >= lo && h < hi;
    }).length,
  }));
  const shown = expanded ? mine : mine.slice(0, FIRST_TRIPS);

  if (!place) {
    return (
      <SubPage title="Luogo">
        <EmptyNote text="Luogo non trovato: forse è stato eliminato." />
      </SubPage>
    );
  }

  return (
    <SubPage title="Luogo" right={<SmallPill label="Modifica" onPress={() => router.push(`/place/${place.id}`)} />}>
      <View style={styles.head}>
        <PlaceGlyph d={PLACE_ICON_PATHS[place.icon]} color={place.color} size={48} />
        <View style={styles.flex}>
          <Text style={styles.title}>{place.name}</Text>
          <Text style={styles.muted}>{[address, `raggio ${place.radius_m} m`].filter(Boolean).join(" · ")}</Text>
        </View>
      </View>

      <PeriodPicker kinds={KINDS} kind={kind} offset={offset} caption={period.caption} onKind={setKind} onOffset={setOffset} />

      <TripsMap
        key={`${period.caption}:${mine.length}`}
        trips={mine}
        places={basics.places}
        placeMap={basics.placeMap}
        state={basics.state}
        focus={place}
        height={280}
        onPlacePress={(p) => p.id !== place.id && router.push(`/places/${p.id}`)}
      />

      <StatGrid
        cells={[
          {
            label: "ARRIVI",
            value: String(arrivals.length),
            sub: arrivalsDelta != null && period.previousName ? `${f.pct(arrivalsDelta)} rispetto a ${period.previousName}` : undefined,
          },
          { label: "PARTENZE", value: String(departures.length) },
          { label: "KM DA E VERSO", value: f.km(all.km), unit: "km", sub: all.trips ? `${f.km(all.km / all.trips)} km a viaggio` : undefined },
          { label: "ALLA GUIDA", value: f.duration(all.seconds), sub: all.trips ? `${f.duration(all.seconds / all.trips)} a viaggio` : undefined },
          {
            label: "CONSUMO",
            value: f.num(all.lPer100),
            unit: "L/100 km",
            sub: consVs != null ? `${f.pct(consVs)} rispetto alla media` : undefined,
            subTone: consVs == null || Math.abs(consVs) < 0.03 ? "neutral" : consVs < 0 ? "good" : "warn",
          },
          { label: "COSTO", value: f.eur(all.cost), sub: all.cost != null && all.trips ? `${f.eur(all.cost / all.trips)} a viaggio` : undefined },
        ]}
      />

      {arrivals.length > 0 && (
        <Bars
          key={`${kind}:${offset}`}
          values={perBucketArrivals}
          names={buckets.map((b) => bucketName(b, period.kind))}
          axisLabels={axisLabelsFor(buckets, period.kind)}
          width={CONTENT_W}
          title={`Arrivi ${perBucket(period.kind)}`}
          format={(v) => `${f.num(v, Number.isInteger(v) ? 0 : 1)} ${v === 1 ? "arrivo" : "arrivi"}`}
          unit="ARRIVI"
        />
      )}

      {(origins.length > 0 || nexts.length > 0) && (
        <View style={styles.columns}>
          <RankList title="DA DOVE ARRIVI" items={origins} />
          <RankList title="DOVE VAI DOPO" items={nexts} />
        </View>
      )}

      {arrivals.length > 0 && (
        <View style={styles.block}>
          <SectionHeader title="A che ora arrivi" />
          <HBars items={hours.map((h) => ({ label: `${h.label}`, value: h.value }))} />
        </View>
      )}

      <View>
        <SectionHeader title="Viaggi" right={mine.length ? `${mine.length}` : undefined} />
        {mine.length === 0 ? (
          <EmptyNote text="Nessun viaggio da o verso questo luogo nel periodo." />
        ) : (
          shown.map((t) => (
            <View key={t.id} style={styles.tripLine}>
              <Eyebrow>{f.dayHeader(new Date(t.started_at))}</Eyebrow>
              <TripRow
                trip={t}
                from={endpoint(t, "start", basics.placeMap, addresses)}
                to={endpoint(t, "end", basics.placeMap, addresses)}
                cost={tripCost(t, price)}
                onPress={() => router.push(`/trip/${t.id}`)}
              />
            </View>
          ))
        )}
        {mine.length > FIRST_TRIPS && !expanded && (
          <Pressable onPress={() => setExpanded(true)} style={({ pressed }) => [styles.more, pressed && styles.pressed]}>
            <Text style={styles.moreText}>Tutti i {mine.length} viaggi</Text>
          </Pressable>
        )}
      </View>
    </SubPage>
  );
}

interface Ranked {
  name: string;
  color: string | null;
  count: number;
}

/** Le mete (o provenienze) piu' frequenti, al massimo quattro. */
function rank(trips: TripSummary[], of: (t: TripSummary) => { name: string; color: string | null }): Ranked[] {
  const map = new Map<string, Ranked>();
  for (const t of trips) {
    const e = of(t);
    const r = map.get(e.name) ?? { name: e.name, color: e.color, count: 0 };
    r.count += 1;
    map.set(e.name, r);
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 4);
}

function RankList({ title, items }: { title: string; items: Ranked[] }) {
  return (
    <View style={styles.rank}>
      <Eyebrow>{title}</Eyebrow>
      {items.length === 0 ? (
        <Text style={styles.muted}>—</Text>
      ) : (
        items.map((it) => (
          <View key={it.name} style={styles.rankRow}>
            <Dot color={it.color ?? "rgba(255,255,255,0.4)"} />
            <Text style={styles.rankName} numberOfLines={1}>{it.name}</Text>
            <Text style={styles.muted}>{it.count}</Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  block: { gap: 12 },
  head: { flexDirection: "row", alignItems: "center", gap: 14 },
  title: { fontSize: 26, fontWeight: "600", color: colors.textPrimary, letterSpacing: -0.3 },
  muted: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  columns: { flexDirection: "row", gap: 16 },
  rank: { flex: 1, gap: 10 },
  rankRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  rankName: { flex: 1, fontSize: 14, color: colors.textPrimary },
  tripLine: { paddingTop: 10, borderTopWidth: 1, borderTopColor: HAIRLINE_SOFT, marginTop: 6 },
  more: {
    marginTop: 12,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  moreText: { fontSize: 14, fontWeight: "500", color: colors.textPrimary },
});
