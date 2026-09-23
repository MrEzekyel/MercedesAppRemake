import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import type { ComponentType } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api, ApiError } from "../../src/api";
import { AppHeader } from "../../src/components/AppHeader";
import { useCarTransition } from "../../src/components/CarTransition";
import {
  AlertIcon,
  BrakeIcon,
  CheckIcon,
  ChevronIcon,
  ClockIcon,
  DoorClosedIcon,
  DoorOpenIcon,
  FuelIcon,
  type IconProps,
  LeafIcon,
  LockIcon,
  OdometerIcon,
  RangeIcon,
  TireIcon,
  TrunkIcon,
  UnlockIcon,
  WindowClosedIcon,
  WindowIcon,
  WindowOpenIcon,
  WrenchIcon,
} from "../../src/components/icons";
import { VehicleGreeting } from "../../src/components/VehicleGreeting";
import { colors, radius, spacing } from "../../src/theme";
import type { VehicleState } from "../../src/types";
import { useSwipeNav } from "../../src/useSwipeNav";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
/**
 * Foto dall'alto a tutto schermo, con lo stesso zoom della Home: e' anche
 * l'ultimo fotogramma del video di transizione, che cosi' passa alla foto
 * senza scatti. Le posizioni sotto sono frazioni dell'altezza dello schermo
 * misurate sull'auto nella foto (coperta in altezza, zoom 1.09 dal centro).
 */
const HERO_ZOOM = 1.09;
const REAR_AXLE_Y = Math.round(SCREEN_H * 0.39);
const FRONT_AXLE_Y = Math.round(SCREEN_H * 0.63);
const CORNER_HALF_H = 30;
/** Subito sotto il muso dell'auto. */
const SEGMENT_Y = Math.round(SCREEN_H * 0.715);
/** Dove la lista comincia a salire sopra la foto. */
const SHEET_Y = Math.round(SCREEN_H * 0.79);

type Mode = "aperture" | "manutenzione";

/**
 * Nello scatto il muso e' rivolto verso il basso: guardando l'auto
 * dall'alto da davanti, il suo lato sinistro cade a destra nell'immagine e
 * l'avantreno in basso. Le pastiglie seguono la posizione reale della
 * ruota sulla foto, non l'ordine con cui si elencano a parole.
 */
const CORNERS = [
  { key: "rr", label: "PD", pos: "tl", tire: "rear_right", door: "door_rear_right", window: "window_rear_right" },
  { key: "rl", label: "PS", pos: "tr", tire: "rear_left", door: "door_rear_left", window: "window_rear_left" },
  { key: "fr", label: "AD", pos: "bl", tire: "front_right", door: "door_front_right", window: "window_front_right" },
  { key: "fl", label: "AS", pos: "br", tire: "front_left", door: "door_front_left", window: "window_front_left" },
] as const;

const WARNING_LABELS: Record<string, string> = {
  brake_fluid: "Liquido freni",
  coolant_low: "Liquido di raffreddamento",
  engine_light: "Spia motore",
  washer_fluid: "Liquido lavavetri",
  brake_pad_wear: "Usura pastiglie freni",
};

/**
 * Scheda completa del veicolo: al centro l'auto vista dall'alto con i
 * quattro angoli "vivi", perche' i dati che hanno una posizione fisica
 * (gomme, porte, finestrini) si leggono meglio dove stanno sull'auto che in
 * un elenco. Il selettore cambia cosa raccontano gli angoli; tutto il resto
 * resta sotto in forma testuale.
 */
export default function InfoVeicoloScreen() {
  const [state, setState] = useState<VehicleState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [mode, setMode] = useState<Mode>("aperture");
  const { play, contentOpacity, vehicleState, reportVehicleState } = useCarTransition();
  const scrollRef = useRef<ScrollView>(null);

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
      // Uscendo si torna in cima: al ritorno header e saluto devono stare
      // dove li ridisegna il video di transizione, non scrollati via.
      return () => scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, [load])
  );

  useEffect(() => reportVehicleState(state), [state, reportVehicleState]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const openings = state?.openings ?? {};
  const tires = state?.tire_pressures ?? {};
  const warnings = Object.entries(WARNING_LABELS).filter(([key]) => state?.warnings?.[key]);
  const service = state?.service_interval_days ?? null;

  // Ultima tab: solo a destra c'e' un'altra schermata (Viaggi).
  const swipe = useSwipeNav({
    onSwipeRight: () => play("info", "trips", () => router.replace("/trips")),
  });

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} />
      }
      {...swipe}
    >
      <View style={styles.hero}>
        <Image
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          source={require("../../assets/vehicle/top.jpg")}
          style={styles.heroImage}
          resizeMode="cover"
        />

        {/* Header e saluto identici in tutte le schermate: restano fermi
            anche durante il video di transizione, non sfumano mai. */}
        <AppHeader />
        <VehicleGreeting state={vehicleState} />

        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: contentOpacity }]}
          pointerEvents="box-none"
        >
          {CORNERS.map((corner) => {
            const isTop = corner.pos[0] === "t";
            const isLeft = corner.pos[1] === "l";

            const pressure = tires[corner.tire];
            const doorOpen = openings[corner.door] === "open";
            const windowState = openings[corner.window];
            const windowOpen = windowState !== undefined && windowState !== "closed";

            const alert =
              mode === "manutenzione"
                ? pressure != null && (pressure < 1.8 || pressure > 2.6)
                : doorOpen || windowOpen;

            return (
              <View
                key={corner.key}
                style={[
                  styles.corner,
                  { top: (isTop ? REAR_AXLE_Y : FRONT_AXLE_Y) - CORNER_HALF_H },
                  isLeft ? styles.cornerLeft : styles.cornerRight,
                  alert && styles.cornerAlert,
                ]}
              >
                <Text style={styles.cornerLabel}>{corner.label}</Text>

                {mode === "manutenzione" ? (
                  <Text style={[styles.cornerValue, alert && styles.cornerValueAlert]}>
                    {pressure != null ? `${pressure.toFixed(2)} bar` : "—"}
                  </Text>
                ) : (
                  <View style={styles.cornerIcons}>
                    {doorOpen ? (
                      <DoorOpenIcon size={19} color={colors.warning} strokeWidth={1.35} />
                    ) : (
                      <DoorClosedIcon size={19} color="rgba(255,255,255,0.8)" strokeWidth={1.35} />
                    )}
                    {windowOpen ? (
                      <WindowOpenIcon size={19} color={colors.warning} strokeWidth={1.35} />
                    ) : (
                      <WindowClosedIcon size={19} color="rgba(255,255,255,0.8)" strokeWidth={1.35} />
                    )}
                  </View>
                )}
              </View>
            );
          })}

          <View style={styles.segment}>
            <SegmentButton label="Aperture" active={mode === "aperture"} onPress={() => setMode("aperture")} />
            <SegmentButton
              label="Manutenzione"
              active={mode === "manutenzione"}
              onPress={() => setMode("manutenzione")}
            />
          </View>
        </Animated.View>
      </View>

      {/* La lista sale sopra la foto scorrendo, come in Viaggi. */}
      <Animated.View style={[styles.sheet, { opacity: contentOpacity }]}>
        <LinearGradient
          colors={["transparent", "rgba(11,18,32,0.75)", colors.background]}
          locations={[0, 0.5, 1]}
          style={styles.sheetFade}
          pointerEvents="none"
        />

        <View style={styles.body}>
          {error && <Text style={styles.errorText}>{error}</Text>}
          {mode === "aperture" ? (
            <>
              <SectionLabel>Chiusure</SectionLabel>
              <InfoRow
                Icon={state?.doors_locked ? LockIcon : UnlockIcon}
                label="Serratura centrale"
                value={state?.doors_locked == null ? "—" : state.doors_locked ? "Chiusa" : "Aperta"}
                alert={state?.doors_locked === false}
              />
              <InfoRow
                Icon={WindowIcon}
                label="Finestrini"
                value={openings.windows_overall ? windowLabel(openings.windows_overall) : "—"}
                alert={openings.windows_overall !== undefined && openings.windows_overall !== "closed"}
              />
              <InfoRow
                Icon={TrunkIcon}
                label="Cofano"
                value={openings.hood ? (openings.hood === "open" ? "Aperto" : "Chiuso") : "—"}
                alert={openings.hood === "open"}
              />
              <InfoRow
                Icon={BrakeIcon}
                label="Freno di stazionamento"
                value={
                  state?.park_brake_engaged == null
                    ? "—"
                    : state.park_brake_engaged
                      ? "Inserito"
                      : "Disinserito"
                }
              />
            </>
          ) : (
            <>
              <SectionLabel>Manutenzione</SectionLabel>
              <InfoRow
                Icon={WrenchIcon}
                label="Prossimo tagliando"
                value={
                  service == null
                    ? "—"
                    : service < 0
                      ? `Scaduto da ${Math.abs(service)} giorni`
                      : `Tra ${service} giorni`
                }
                alert={service != null && service < 0}
              />
              <InfoRow
                Icon={TireIcon}
                label="Pressione gomme"
                value={
                  Object.keys(tires).length > 0
                    ? `${Object.values(tires).length} ruote rilevate`
                    : "Nessun dato"
                }
              />

              <SectionLabel style={styles.sectionSpaced}>Avvisi</SectionLabel>
              {warnings.length === 0 ? (
                <InfoRow Icon={CheckIcon} label="Nessun avviso attivo" value="" />
              ) : (
                warnings.map(([key, label]) => (
                  <InfoRow key={key} Icon={AlertIcon} label={label} value="Attivo" alert />
                ))
              )}

              <SectionLabel style={styles.sectionSpaced}>Efficienza di guida</SectionLabel>
              <EcoBar label="Accelerazione" value={state?.eco_score?.accel ?? 0} />
              <EcoBar label="Costanza" value={state?.eco_score?.const ?? 0} />
              <EcoBar label="Veleggio" value={state?.eco_score?.freewheel ?? 0} />
            </>
          )}

          <SectionLabel style={styles.sectionSpaced}>Dati generali</SectionLabel>
          <InfoRow Icon={OdometerIcon} label="Contachilometri" value={fmtKm(state?.odometer_km)} />
          <InfoRow
            Icon={FuelIcon}
            label="Carburante"
            value={state?.fuel_level_pct != null ? `${state.fuel_level_pct.toFixed(0)} %` : "—"}
          />
          <InfoRow
            Icon={RangeIcon}
            label="Autonomia"
            value={state?.range_km != null ? `${state.range_km.toFixed(0)} km` : "—"}
          />
          <InfoRow
            Icon={LeafIcon}
            label="Capacita' serbatoio"
            value={state?.tank_capacity_l ? `${state.tank_capacity_l} l` : "—"}
          />
          <InfoRow
            Icon={ClockIcon}
            label="Accensione"
            value={ignitionLabel(state?.ignition_state, state?.engine_running)}
          />
          <InfoRow Icon={CheckIcon} label="Telaio (VIN)" value={state?.vin ?? "—"} mono />

          <Pressable
            onPress={() => router.push("/refuels")}
            style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
          >
            <FuelIcon size={18} color={colors.accent} strokeWidth={1.3} />
            <View style={styles.linkText}>
              <Text style={styles.linkTitle}>Rifornimenti</Text>
              <Text style={styles.linkCaption}>Storico e conferme in sospeso</Text>
            </View>
            <ChevronIcon size={15} color="rgba(255,255,255,0.32)" strokeWidth={1.5} />
          </Pressable>
        </View>
      </Animated.View>
    </ScrollView>
  );
}

function SegmentButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.segmentButton, active && styles.segmentButtonActive]}>
      <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function SectionLabel({ children, style }: { children: string; style?: object }) {
  return <Text style={[styles.sectionLabel, style]}>{children}</Text>;
}

function InfoRow({
  Icon,
  label,
  value,
  alert,
  mono,
}: {
  Icon: ComponentType<IconProps>;
  label: string;
  value: string;
  alert?: boolean;
  mono?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Icon size={17} color={alert ? colors.warning : "rgba(255,255,255,0.55)"} strokeWidth={1.3} />
      <Text style={styles.rowLabel}>{label}</Text>
      {value !== "" && (
        <Text style={[styles.rowValue, alert && styles.rowValueAlert, mono && styles.rowValueMono]}>
          {value}
        </Text>
      )}
    </View>
  );
}

function EcoBar({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.ecoRow}>
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

function windowLabel(status: string | undefined): string {
  switch (status) {
    case "open":
      return "Aperto";
    case "airing":
      return "Aerazione";
    case "intermediate":
      return "Parziale";
    case "closed":
      return "Chiuso";
    default:
      return "—";
  }
}

function ignitionLabel(state: string | null | undefined, running: boolean | null | undefined): string {
  if (running) return "Motore acceso";
  if (!state) return "—";
  return state === "off" ? "Spento" : state;
}

function fmtKm(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${Math.round(value).toLocaleString("it-IT")} km`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  /** La tab bar e' trasparente e sovrapposta: il contenuto le lascia spazio. */
  content: { paddingBottom: 110 },

  errorText: { fontSize: 12, color: colors.danger, textAlign: "center", marginBottom: spacing.sm },

  hero: { height: SCREEN_H, overflow: "hidden" },
  heroImage: {
    position: "absolute",
    top: 0,
    left: 0,
    width: SCREEN_W,
    height: SCREEN_H,
    transform: [{ scale: HERO_ZOOM }],
  },

  segment: {
    position: "absolute",
    top: SEGMENT_Y,
    flexDirection: "row",
    alignSelf: "center",
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  segmentButton: { paddingVertical: 7, paddingHorizontal: spacing.md + 2, borderRadius: radius.pill },
  segmentButtonActive: { backgroundColor: "rgba(255,255,255,0.13)" },
  segmentLabel: { fontSize: 12.5, fontWeight: "500", color: "rgba(255,255,255,0.5)" },
  segmentLabelActive: { color: colors.textPrimary, fontWeight: "600" },

  sheet: { marginTop: SHEET_Y - SCREEN_H, backgroundColor: colors.background },
  sheetFade: { position: "absolute", left: 0, right: 0, top: -90, height: 90 },
  corner: {
    position: "absolute",
    minWidth: 92,
    paddingVertical: 8,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    gap: 2,
  },
  cornerAlert: { borderColor: "rgba(224,166,60,0.45)", backgroundColor: "rgba(224,166,60,0.1)" },
  cornerLeft: { left: spacing.md },
  cornerRight: { right: spacing.md, alignItems: "flex-end" },
  cornerLabel: {
    fontSize: 8.5,
    letterSpacing: 1.3,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.4)",
  },
  cornerValue: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  cornerValueAlert: { color: colors.warning },
  cornerIcons: { flexDirection: "row", gap: spacing.sm, marginTop: 2 },

  body: { paddingHorizontal: spacing.md },
  sectionLabel: {
    fontSize: 9.5,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.42)",
    marginBottom: spacing.xs,
  },
  sectionSpaced: { marginTop: spacing.lg },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    paddingVertical: spacing.sm + 3,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  rowLabel: { flex: 1, fontSize: 14, color: colors.textPrimary },
  rowValue: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  rowValueAlert: { color: colors.warning },
  rowValueMono: { fontSize: 11, letterSpacing: 0.5 },

  ecoRow: { paddingVertical: spacing.sm + 2, gap: 7 },
  ecoHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  ecoValue: { fontSize: 13, fontWeight: "600", color: colors.accent },
  ecoTrack: { height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.1)", overflow: "hidden" },
  ecoFill: { height: "100%", backgroundColor: colors.accent, borderRadius: 2 },

  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  linkPressed: { opacity: 0.6 },
  linkText: { flex: 1, gap: 2 },
  linkTitle: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  linkCaption: { fontSize: 11.5, color: "rgba(255,255,255,0.45)" },
});
