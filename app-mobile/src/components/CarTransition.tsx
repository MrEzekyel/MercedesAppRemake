/**
 * Transizioni video fra le schermate con la foto dell'auto (Home, dettaglio,
 * Viaggi, Info veicolo), al posto del semplice cambio di pagina: primo e ultimo
 * fotogramma di ogni clip combaciano con la foto della schermata di
 * partenza e di arrivo, quindi l'occhio vede un solo movimento continuo.
 *
 * Vive in radice (vedi app/_layout.tsx) invece che dentro una schermata:
 * solo cosi' resta visibile mentre la navigazione sotto cambia.
 *
 * Un player per clip, invece di uno solo con la sorgente scambiata al volo:
 * nessun fotogramma nero mentre un player ricarica, la clip giusta e'
 * sempre gia' pronta a partire.
 */
import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Animated, Dimensions, Easing, StyleSheet, View } from "react-native";
import { useVideoPlayer, VideoView, type VideoPlayer } from "expo-video";
import { colors } from "../theme";
import type { VehicleState } from "../types";
import { AppHeader } from "./AppHeader";
import { AppTabBar, type TabName } from "./AppTabBar";
import { VehicleGreeting } from "./VehicleGreeting";

export type Scene = "home" | "detail" | "trips" | "info";

interface CarTransitionApi {
  /**
   * Transizione video da una schermata all'altra; `onDone` naviga ed e'
   * chiamato subito (la schermata di arrivo si monta sotto il video). Senza
   * una clip per quella coppia naviga e basta.
   */
  play: (from: Scene, to: Scene, onDone: () => void) => void;
  /**
   * Ultimo stato veicolo noto, condiviso: il saluto in alto lo legge da qui
   * in ogni schermata e sopra il video, cosi' e' identico ovunque e resta
   * fermo in ogni transizione.
   */
  vehicleState: VehicleState | null;
  /** Le schermate lo chiamano quando scaricano uno stato nuovo. */
  reportVehicleState: (state: VehicleState | null) => void;
  /**
   * Opacita' condivisa per la UI sovrapposta alla foto (pannelli, liste,
   * statistiche, titoli che cambiano fra le schermate) — non per la foto,
   * ne' per header e tab bar, che restano fermi. Resta a 1 fuori da una
   * transizione; viene azzerata al tocco e riportata a 1 in dissolvenza
   * dopo il taglio video -> foto.
   */
  contentOpacity: Animated.Value;
}

const CarTransitionContext = createContext<CarTransitionApi | null>(null);

export function useCarTransition(): CarTransitionApi {
  const ctx = useContext(CarTransitionContext);
  if (!ctx) {
    throw new Error("useCarTransition va chiamato dentro <CarTransitionProvider>");
  }
  return ctx;
}

/**
 * Come la clip va sovrapposta allo schermo perche' combaci con la foto
 * della schermata. Il video e' disegnato a tutto schermo in modalita'
 * "cover" e poi scalato/spostato dal centro.
 */
interface Layout {
  scale: number;
  translateY: number;
}

// Proporzioni comuni a tutte le clip e a tutte le foto (1076x1928,
// 1116x2000, 768x1376: stesso rapporto).
const CLIP_ASPECT = 1076 / 1928;

function tripsLayout(): Layout {
  // In Viaggi la foto non e' a tutto schermo: e' larga quanto lo schermo e
  // appoggiata in alto (vedi IMAGE_H in trips.tsx), la lista ne copre il
  // fondo. Il video "cover" e' invece alto quanto lo schermo e centrato.
  const { width: W, height: H } = Dimensions.get("window");
  // Il video e' scalato attorno al centro dello schermo e poi spostato:
  // largo quanto lo schermo, con il centro a meta' dell'altezza della foto.
  const coverWidth = Math.max(W, H * CLIP_ASPECT);
  const photoHeight = W / CLIP_ASPECT;
  return { scale: W / coverWidth, translateY: photoHeight / 2 - H / 2 };
}

// Zoom con cui le foto statiche tolgono il bordo dello scatto
// (VehicleHeroCard.tsx e vehicle-info.tsx 1.09, vehicle-detail.tsx 1.06).
const LAYOUTS: Record<Scene, () => Layout> = {
  home: () => ({ scale: 1.09, translateY: 0 }),
  detail: () => ({ scale: 1.06, translateY: 0 }),
  trips: tripsLayout,
  info: () => ({ scale: 1.09, translateY: 0 }),
};

interface Clip {
  source: number;
  /** Tappe attraversate (l'ultima e' l'arrivo) e durata di ogni tratto. */
  path: Scene[];
  durations: number[];
}

/* eslint-disable @typescript-eslint/no-require-imports */
const CLIPS: Record<string, Clip> = {
  "home>detail": { source: require("../../assets/vehicle/detail-forward.mp4"), path: ["home", "detail"], durations: [750] },
  "detail>home": { source: require("../../assets/vehicle/detail-reverse.mp4"), path: ["detail", "home"], durations: [750] },
  "home>trips": { source: require("../../assets/vehicle/trips-forward.mp4"), path: ["home", "trips"], durations: [500] },
  "trips>home": { source: require("../../assets/vehicle/trips-reverse.mp4"), path: ["trips", "home"], durations: [500] },
  "home>info": { source: require("../../assets/vehicle/info-forward.mp4"), path: ["home", "info"], durations: [500] },
  "info>home": { source: require("../../assets/vehicle/info-reverse.mp4"), path: ["info", "home"], durations: [500] },
  // Fra due schermate diverse da Home si ripassa dalla sua vista frontale,
  // senza mostrarne la UI: le due clip sono gia' unite in un solo file,
  // cosi' non c'e' esitazione nel passaggio da un video all'altro.
  "detail>trips": {
    source: require("../../assets/vehicle/detail-to-trips.mp4"),
    path: ["detail", "home", "trips"],
    durations: [750, 500],
  },
  "detail>info": {
    source: require("../../assets/vehicle/detail-to-info.mp4"),
    path: ["detail", "home", "info"],
    durations: [750, 500],
  },
  "trips>info": {
    source: require("../../assets/vehicle/trips-to-info.mp4"),
    path: ["trips", "home", "info"],
    durations: [500, 500],
  },
  "info>trips": {
    source: require("../../assets/vehicle/info-to-trips.mp4"),
    path: ["info", "home", "trips"],
    durations: [500, 500],
  },
};
/* eslint-enable @typescript-eslint/no-require-imports */

const CLIP_KEYS = Object.keys(CLIPS);

// Stessa curva con cui sono state ritemporizzate le clip (ease-in-out
// sinusoidale): zoom e spostamento accelerano e rallentano con l'auto.
const CLIP_EASING = Easing.inOut(Easing.sin);

// Il taglio video -> foto avviene su playToEnd; questo e' solo una rete di
// sicurezza, larga: al primo avvio dopo il lancio il player puo' metterci
// oltre un secondo in piu'.
const END_FALLBACK_EXTRA_MS = 1750;

// Dissolvenza della UI DOPO il taglio — mai del video, che non sfuma.
const FADE_MS = 220;

/** Schermata della tab: la tab bar la usa per scegliere la transizione. */
export const TAB_SCENE: Record<TabName, Scene> = {
  index: "home",
  trips: "trips",
  "vehicle-info": "info",
};

const ACTIVE_TAB: Record<Scene, TabName> = {
  home: "index",
  detail: "index",
  trips: "trips",
  info: "vehicle-info",
};

function usePlayers(): Record<string, VideoPlayer> {
  const setup = (p: VideoPlayer) => {
    p.loop = false;
    p.muted = true;
  };
  // Numero di clip fisso: le chiamate agli hook restano sempre le stesse.
  const players: Record<string, VideoPlayer> = {};
  for (const key of CLIP_KEYS) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    players[key] = useVideoPlayer(CLIPS[key].source, setup);
  }
  return players;
}

export function CarTransitionProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<{ key: string; to: Scene } | null>(null);
  const [vehicleState, setVehicleState] = useState<VehicleState | null>(null);
  const reportVehicleState = useCallback((state: VehicleState | null) => {
    if (state) setVehicleState(state);
  }, []);
  const cleanup = useRef<(() => void) | null>(null);
  const scale = useRef(new Animated.Value(1.09)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const players = usePlayers();
  // In un ref: i player sono sempre gli stessi, ma l'oggetto che li raccoglie
  // e' nuovo a ogni render e renderebbe `play` instabile.
  const playersRef = useRef(players);

  const play = useCallback(
    (from: Scene, to: Scene, onDone: () => void) => {
      const key = `${from}>${to}`;
      const clip = CLIPS[key];
      if (!clip) {
        onDone();
        return;
      }
      const player = playersRef.current[key];
      cleanup.current?.();

      contentOpacity.setValue(0);

      const layouts = clip.path.map((scene) => LAYOUTS[scene]());
      scale.setValue(layouts[0].scale);
      translateY.setValue(layouts[0].translateY);
      // Zoom e spostamento partono subito: il player arriva in fondo ~20ms
      // dopo la durata della clip (misurato), l'evento playingChange invece
      // arriva ~230ms dopo il tocco — aspettarlo lascerebbe lo zoom indietro.
      const segments = clip.durations.map((duration, i) =>
        Animated.parallel(
          (
            [
              [scale, layouts[i + 1].scale],
              [translateY, layouts[i + 1].translateY],
            ] as const
          ).map(([value, toValue]) =>
            Animated.timing(value, { toValue, duration, easing: CLIP_EASING, useNativeDriver: true })
          )
        )
      );
      Animated.sequence(segments).start();

      // Il video sparisce di colpo quando e' davvero arrivato all'ultimo
      // fotogramma (identico alla foto sotto), non dopo un tempo fisso.
      const last = layouts[layouts.length - 1];
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        cleanup.current?.();
        cleanup.current = null;
        scale.stopAnimation();
        translateY.stopAnimation();
        scale.setValue(last.scale);
        translateY.setValue(last.translateY);
        setActive(null);
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: FADE_MS,
          easing: Easing.linear,
          useNativeDriver: true,
        }).start();
      };

      const total = clip.durations.reduce((a, b) => a + b, 0);
      const endSub = player.addListener("playToEnd", finish);
      const endFallback = setTimeout(finish, total + END_FALLBACK_EXTRA_MS);
      cleanup.current = () => {
        endSub.remove();
        clearTimeout(endFallback);
      };

      // replay() riavvolge e basta ("Seeks the playback to the beginning"
      // nei tipi di expo-video): NON fa ripartire la riproduzione.
      player.replay();
      player.play();
      setActive({ key, to });

      // Si naviga SUBITO: il video copre la scena per tutta la clip, e la
      // schermata di arrivo ha tutto quel tempo per montarsi sotto.
      onDone();
    },
    [scale, translateY, contentOpacity]
  );

  return (
    <CarTransitionContext.Provider value={{ play, vehicleState, reportVehicleState, contentOpacity }}>
      {children}
      {active && (
        <>
          {/* Fondo scuro: quando il video non copre tutto lo schermo (foto di
              Viaggi, appoggiata in alto) la fascia libera resta scura come
              lo sfondo di Viaggi, invece di mostrare la schermata sotto. */}
          <View style={[StyleSheet.absoluteFill, styles.backdrop]} pointerEvents="auto" />
          {/* VideoView montata solo durante una transizione, smontata a riposo. */}
          <Animated.View
            style={[StyleSheet.absoluteFill, { transform: [{ translateY }, { scale }] }]}
            pointerEvents="none"
          >
            <VideoView
              player={players[active.key]}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              nativeControls={false}
            />
          </Animated.View>
          {/* Header, saluto e tab bar sono identici in tutte le schermate:
              ridisegnati sopra il video, che altrimenti li coprirebbe, cosi'
              restano fermi per tutta la transizione. */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <AppHeader />
            <VehicleGreeting state={vehicleState} />
            <AppTabBar active={ACTIVE_TAB[active.to]} />
          </View>
        </>
      )}
    </CarTransitionContext.Provider>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: colors.background },
});
