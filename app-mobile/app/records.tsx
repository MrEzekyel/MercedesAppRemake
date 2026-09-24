import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useMemo } from "react";
import { Dimensions, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SubPage } from "../src/components/trips/SubPage";
import { ACCENT_LIGHT, EmptyNote, Eyebrow, GOOD, HAIRLINE_SOFT, WARN } from "../src/components/trips/ui";
import { colors } from "../src/theme";
import { useAddresses, useBasics, useTrips } from "../src/trips/data";
import { monthName } from "../src/trips/period";
import { describeTrip } from "../src/trips/places";
import { records } from "../src/trips/stats";

const { width: SCREEN_W } = Dimensions.get("window");
const ALL = { start: new Date(2000, 0, 1), end: new Date(Date.now() + 86400000) };

/**
 * Albo d'oro: i record di sempre, un numero grande per riga come una targa.
 * Quelli stabiliti questo mese sono in azzurro. Sopra, l'auto di spalle:
 * segnaposto con la foto del dettaglio, in attesa del render "da podio".
 */
export default function RecordsScreen() {
  const { trips } = useTrips(ALL);
  const basics = useBasics();
  // Gli indirizzi servono solo ai viaggi dei record, che possono essere vecchi.
  const recordTrips = useMemo(() => {
    const ids = new Set(
      records({ trips, refuels: [], places: basics.places, price: null, describe: () => "" }).map((r) => r.tripId)
    );
    return trips.filter((t) => ids.has(t.id));
  }, [trips, basics.places]);
  const addresses = useAddresses(recordTrips, basics.placeMap);
  const items = useMemo(
    () =>
      records({
        trips,
        refuels: basics.refuels,
        places: basics.places,
        price: basics.price.value,
        describe: (t) => describeTrip(t, basics.placeMap, addresses),
      }),
    [trips, basics.refuels, basics.places, basics.price.value, basics.placeMap, addresses]
  );
  const first = trips[trips.length - 1];
  const since = first ? `da ${monthName(new Date(first.started_at))} ${new Date(first.started_at).getFullYear()}` : "";

  return (
    <SubPage title="Record" backdrop={<Podium />}>
      <View style={styles.photoSpace} />
      <View style={styles.head}>
        <Text style={styles.title}>Albo d'oro</Text>
        <Text style={styles.since}>{since}</Text>
      </View>
      <View>
        {items.length === 0 ? (
          <EmptyNote text="I record compaiono dopo i primi viaggi." />
        ) : (
          items.map((r) => {
            const color = r.isNew ? ACCENT_LIGHT : r.tone === "good" ? GOOD : r.tone === "warn" ? WARN : colors.textPrimary;
            return (
              <Pressable
                key={r.key}
                disabled={!r.tripId}
                onPress={() => r.tripId && router.push(`/trip/${r.tripId}`)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <Text style={[styles.value, { color }]} numberOfLines={1} adjustsFontSizeToFit>
                  {r.value}
                  <Text style={styles.unit}> {r.unit}</Text>
                </Text>
                <View style={styles.text}>
                  <Eyebrow>{r.label}</Eyebrow>
                  <Text style={styles.what} numberOfLines={2}>{r.what}</Text>
                  {r.when || r.isNew ? (
                    <Text style={styles.when}>{[r.when, r.isNew ? "nuovo" : null].filter(Boolean).join(" · ")}</Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })
        )}
      </View>
    </SubPage>
  );
}

/** L'auto di spalle in una fascia a tutta larghezza, sfumata sopra e sotto. */
function Podium() {
  return (
    <View style={styles.podium} pointerEvents="none">
      <Image
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source={require("../assets/vehicle/rear.jpg")}
        style={styles.podiumImage}
        resizeMode="cover"
      />
      <LinearGradient colors={[colors.background, "rgba(6,9,16,0)"]} locations={[0.1, 1]} style={styles.fadeTop} />
      <LinearGradient colors={["rgba(6,9,16,0)", colors.background]} style={styles.fadeBottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.6 },
  podium: { position: "absolute", top: 150, left: 0, width: SCREEN_W, height: 400, overflow: "hidden" },
  podiumImage: { position: "absolute", top: -170, left: -SCREEN_W * 0.15, width: SCREEN_W * 1.3, height: SCREEN_W * 1.3 * (2000 / 1116) },
  fadeTop: { position: "absolute", top: 0, left: 0, right: 0, height: 150 },
  fadeBottom: { position: "absolute", bottom: 0, left: 0, right: 0, height: 140 },

  photoSpace: { height: 160 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: -14 },
  title: { fontSize: 28, fontWeight: "600", color: colors.textPrimary, letterSpacing: -0.3 },
  since: { fontSize: 13, color: colors.textSecondary },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: HAIRLINE_SOFT,
  },
  value: { width: 150, fontSize: 36, fontWeight: "200", letterSpacing: -1 },
  unit: { fontSize: 13, letterSpacing: 0, color: colors.textSecondary, fontWeight: "400" },
  text: { flex: 1, gap: 3 },
  what: { fontSize: 14, color: colors.textPrimary },
  when: { fontSize: 12, color: colors.textTertiary },
});
