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
import { Animated, Easing, StyleSheet, View } from "react-native";
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
   * chiamato appena il video parte (la schermata di arrivo si monta sotto
   * il video). Senza una clip per quella coppia naviga e basta.
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
 * Zoom con cui ogni schermata mostra la sua foto a tutto schermo ("cover",
 * scalata dal centro) per togliere il bordo dello scatto. Il video e'
 * disegnato allo stesso modo e passa dallo zoom di partenza a quello di
 * arrivo, cosi' primo e ultimo fotogramma combaciano con le foto.
 */
const ZOOM: Record<Scene, number> = {
  home: 1.09,
  detail: 1.06,
  trips: 1.09,
  info: 1.09,
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

// Se la vista video non segnala il primo fotogramma, si parte comunque.
const READY_FALLBACK_MS = 400;

// Attesa prima di riavvolgere il video finito: la sua vista deve essere
// gia' smontata, o il riavvolgimento si vedrebbe.
const REWIND_DELAY_MS = 300;

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

/**
 * Fermo sul primo fotogramma. Non replay(): su iOS riavvolge E fa partire
 * il video (VideoModule.swift, player.ref.play()), che cosi' correva mentre
 * la vista non era ancora pronta e compariva gia' a meta' movimento.
 */
function rewind(player: VideoPlayer) {
  player.pause();
  player.currentTime = 0;
}

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
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  // Avvio della transizione in attesa del primo fotogramma della vista video.
  const startRef = useRef<(() => void) | null>(null);
  // Cresce a ogni transizione: un riavvolgimento rimandato non tocca un
  // player che nel frattempo e' ripartito.
  const generation = useRef(0);
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
      generation.current += 1;

      contentOpacity.setValue(0);
      // Il video resta invisibile finche' la sua vista non ha il primo
      // fotogramma pronto: nel frattempo si vede la schermata di partenza,
      // ferma e identica a quel fotogramma. Mostrarlo subito lasciava un
      // attimo di fondo scuro e poi il video gia' avanzato (lo scatto in
      // partenza), perche' la vista nasce solo ora e ci mette un po'.
      overlayOpacity.setValue(0);

      const zooms = clip.path.map((scene) => ZOOM[scene]);
      scale.setValue(zooms[0]);
      const lastZoom = zooms[zooms.length - 1];
      const total = clip.durations.reduce((a, b) => a + b, 0);

      // Il video sparisce di colpo quando e' davvero arrivato all'ultimo
      // fotogramma (identico alla foto sotto), non dopo un tempo fisso.
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        cleanup.current?.();
        cleanup.current = null;
        scale.stopAnimation();
        scale.setValue(lastZoom);
        setActive(null);
        // Riavvolto a vista gia' smontata, cosi' la prossima volta il primo
        // fotogramma pronto e' davvero il primo. Non subito: lo smontaggio
        // arriva un render dopo, e nel frattempo il video riavvolto mostrava
        // per un istante la schermata di partenza.
        const gen = generation.current;
        setTimeout(() => {
          if (generation.current === gen) rewind(player);
        }, REWIND_DELAY_MS);
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: FADE_MS,
          easing: Easing.linear,
          useNativeDriver: true,
        }).start();
      };

      let endSub: { remove: () => void } | null = null;
      let endFallback: ReturnType<typeof setTimeout> | null = null;
      let started = false;
      let readyFallback: ReturnType<typeof setTimeout> | undefined;
      const start = () => {
        if (started || finished) return;
        started = true;
        startRef.current = null;
        clearTimeout(readyFallback);
        overlayOpacity.setValue(1);
        player.play();
        // Zoom e video partono insieme, nello stesso istante.
        Animated.sequence(
          clip.durations.map((duration, i) =>
            Animated.timing(scale, {
              toValue: zooms[i + 1],
              duration,
              easing: CLIP_EASING,
              useNativeDriver: true,
            })
          )
        ).start();
        endSub = player.addListener("playToEnd", finish);
        endFallback = setTimeout(finish, total + END_FALLBACK_EXTRA_MS);
        // Si naviga solo ora, col video gia' a coprire tutto: la schermata
        // di arrivo ha l'intera clip per montarsi sotto.
        onDone();
      };
      startRef.current = start;
      readyFallback = setTimeout(start, READY_FALLBACK_MS);
      cleanup.current = () => {
        startRef.current = null;
        clearTimeout(readyFallback);
        endSub?.remove();
        if (endFallback) clearTimeout(endFallback);
      };

      // Fermo sul primo fotogramma fino a `start`.
      rewind(player);
      setActive({ key, to });
    },
    [scale, contentOpacity, overlayOpacity]
  );

  return (
    <CarTransitionContext.Provider value={{ play, vehicleState, reportVehicleState, contentOpacity }}>
      {children}
      {active && (
        // Trasparente (ma gia' a bloccare i tocchi) finche' il video non ha
        // il primo fotogramma pronto, poi visibile di colpo: vedi `start`.
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: overlayOpacity }]}>
          {/* Fondo scuro sotto il video: blocca i tocchi durante la
              transizione e non lascia mai intravedere la schermata sotto. */}
          <View style={[StyleSheet.absoluteFill, styles.backdrop]} pointerEvents="auto" />
          {/* VideoView montata solo durante una transizione, smontata a riposo;
              `key` la ricrea a ogni clip, cosi' onFirstFrameRender scatta sempre. */}
          <Animated.View
            style={[StyleSheet.absoluteFill, { transform: [{ scale }] }]}
            pointerEvents="none"
          >
            <VideoView
              key={active.key}
              player={players[active.key]}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              nativeControls={false}
              onFirstFrameRender={() => startRef.current?.()}
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
        </Animated.View>
      )}
    </CarTransitionContext.Provider>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: colors.background },
});
