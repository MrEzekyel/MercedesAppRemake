/**
 * Ponte video fra Home e dettaglio veicolo, al posto del semplice
 * scorrimento di navigazione: al tocco sull'auto parte l'orbit
 * cinematografico (fermo lo start/end frame combaciano esattamente con lo
 * sfondo di Home e del dettaglio), e lo stesso al contrario tornando
 * indietro.
 *
 * Vive in radice (vedi app/_layout.tsx) invece che dentro una singola
 * schermata: solo cosi' puo' restare visibile sopra lo schermo mentre la
 * navigazione sotto cambia, cosa impossibile se il video fosse dentro Home
 * o dentro il dettaglio (sparirebbe insieme alla schermata che lo ospita).
 *
 * Due player separati, uno per direzione, invece di uno solo con la
 * sorgente scambiata al volo: cosi' non c'e' mai un fotogramma nero
 * mentre un player ricarica una nuova sorgente, il video giusto e' sempre
 * gia' pronto a partire.
 */
import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Animated, Easing, StyleSheet } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";

type Direction = "forward" | "reverse" | null;

interface CarTransitionApi {
  /** Home -> dettaglio. */
  playForward: (onDone: () => void) => void;
  /** Dettaglio -> Home, stesso principio al contrario. */
  playReverse: (onDone: () => void) => void;
  /**
   * Opacita' condivisa per il contenuto "informativo" sovrapposto alla
   * foto/video (testo, pannello comandi, statistiche) — non per la
   * fotografia stessa, che sta gia' sotto ed e' sempre visibile. Resta a 1
   * fuori da una transizione; viene azzerata all'inizio di un tocco
   * sull'auto e riportata a 1 in dissolvenza mentre il video sfuma,
   * cosi' la UI della schermata di arrivo non "compare di scatto" ma si
   * materializza insieme allo svanire del video. E' condivisa (un solo
   * valore, non uno per schermata) perche' a ogni transizione solo la
   * schermata di ARRIVO deve restare invisibile finche' non tocca a lei;
   * quella di partenza e' comunque coperta dal video sopra, quindi non
   * importa se anche lei e' agganciata allo stesso valore.
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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const FORWARD_SOURCE = require("../../assets/vehicle/detail-forward.mp4");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const REVERSE_SOURCE = require("../../assets/vehicle/detail-reverse.mp4");

// Deve combaciare con la durata reale dei due file mp4 (0,75s, vedi il
// comando ffmpeg usato per generarli).
const CLIP_DURATION_MS = 750;

// Ultima porzione del video durante cui video e contenuto fanno il cambio:
// il video sfuma a 0 mentre la UI della schermata di arrivo sfuma a 1, in
// parallelo, cosi' l'una prende il posto dell'altro con un "banale fade"
// invece di un pop improvviso. Va tenuta corta rispetto ai 750ms totali:
// troppo lunga e il video sembra fermarsi prima della fine.
const FADE_MS = 260;
const NAV_AT_MS = CLIP_DURATION_MS - FADE_MS;

// Le due schermate statiche zoomano la foto di una quantita' leggermente
// diversa (VehicleHeroCard.tsx usa 1.09, vehicle-detail.tsx usa 1.06): il
// video deve iniziare/finire esattamente su quegli stessi valori, non su
// uno zoom fisso, altrimenti il fotogramma di passaggio non combacia con
// la schermata sotto e si vede uno scatto.
const HOME_ZOOM = 1.09;
const DETAIL_ZOOM = 1.06;

export function CarTransitionProvider({ children }: { children: ReactNode }) {
  const [direction, setDirection] = useState<Direction>(null);
  const navTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoom = useRef(new Animated.Value(HOME_ZOOM)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const contentOpacity = useRef(new Animated.Value(1)).current;

  const forwardPlayer = useVideoPlayer(FORWARD_SOURCE, (p) => {
    p.loop = false;
    p.muted = true;
  });
  const reversePlayer = useVideoPlayer(REVERSE_SOURCE, (p) => {
    p.loop = false;
    p.muted = true;
  });

  const run = useCallback(
    (which: Direction, player: typeof forwardPlayer, from: number, to: number, onDone: () => void) => {
      if (navTimer.current) clearTimeout(navTimer.current);

      // replay() invece di "currentTime = 0" + play(): quest'ultimo e'
      // un seek asincrono, e se il player era fermo sull'ultimo
      // fotogramma di una riproduzione precedente, play() poteva partire
      // prima che il seek fosse completato — un fotogramma dalla FINE
      // del giro precedente lampeggiava per un istante all'inizio.
      // replay() e' pensato apposta per "riparti dall'inizio" e lo fa in
      // un solo passo affidabile.
      player.replay();
      setDirection(which);

      overlayOpacity.setValue(1);
      contentOpacity.setValue(0);
      zoom.setValue(from);
      Animated.timing(zoom, {
        toValue: to,
        duration: CLIP_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start();

      // Il cambio schermata e la dissolvenza incrociata partono insieme,
      // a tempo (non aspettando l'evento "fine riproduzione" del player,
      // troppo vicino alla soglia di percezione su una clip da 750ms per
      // fidarsene): la nuova schermata ha tutto il tempo di FADE_MS per
      // montarsi sotto mentre il video sta ancora sfumando sopra di lei.
      navTimer.current = setTimeout(() => {
        onDone();
        Animated.parallel([
          Animated.timing(overlayOpacity, {
            toValue: 0,
            duration: FADE_MS,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.timing(contentOpacity, {
            toValue: 1,
            duration: FADE_MS,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ]).start(() => setDirection(null));
      }, NAV_AT_MS);
    },
    [zoom, overlayOpacity, contentOpacity]
  );

  const playForward = useCallback(
    (onDone: () => void) => run("forward", forwardPlayer, HOME_ZOOM, DETAIL_ZOOM, onDone),
    [run, forwardPlayer]
  );

  const playReverse = useCallback(
    (onDone: () => void) => run("reverse", reversePlayer, DETAIL_ZOOM, HOME_ZOOM, onDone),
    [run, reversePlayer]
  );

  return (
    <CarTransitionContext.Provider value={{ playForward, playReverse, contentOpacity }}>
      {children}
      {direction && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { opacity: overlayOpacity, transform: [{ scale: zoom }] },
          ]}
          pointerEvents="auto"
        >
          <VideoView
            player={direction === "forward" ? forwardPlayer : reversePlayer}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            nativeControls={false}
          />
        </Animated.View>
      )}
    </CarTransitionContext.Provider>
  );
}
