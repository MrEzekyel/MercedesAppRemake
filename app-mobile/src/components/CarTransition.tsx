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
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Animated, Easing, StyleSheet } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";

type Direction = "forward" | "reverse" | null;

interface CarTransitionApi {
  /** Home -> dettaglio. onDone naviga: il video resta fermo sull'ultimo
   * fotogramma finche' la schermata di arrivo non e' montata sotto. */
  playForward: (onDone: () => void) => void;
  /** Dettaglio -> Home, stesso principio al contrario. */
  playReverse: (onDone: () => void) => void;
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

// Il video resta fermo sull'ultimo fotogramma questo tempo dopo la fine,
// mentre sotto si monta la schermata di arrivo: e' identico all'ultimo
// fotogramma (front.jpg/rear.jpg sono gli stessi sfondi), quindi il cambio
// e' invisibile. Troppo corto e si rischia un lampo della vecchia
// schermata; troppo lungo e si sente il ritardo.
const HANDOFF_DELAY_MS = 70;

// Deve combaciare con la durata reale dei due file mp4 (0,75s, vedi il
// comando ffmpeg usato per generarli): l'animazione dello zoom e' basata
// sul tempo, non sul player, quindi se la durata del video cambia questo
// valore va aggiornato insieme.
const CLIP_DURATION_MS = 750;

// Le due schermate statiche zoomano la foto di una quantita' leggermente
// diversa (VehicleHeroCard.tsx usa 1.09, vehicle-detail.tsx usa 1.06): il
// video deve iniziare/finire esattamente su quegli stessi valori, non su
// uno zoom fisso, altrimenti il fotogramma di passaggio non combacia con
// la schermata sotto e si vede uno scatto.
const HOME_ZOOM = 1.09;
const DETAIL_ZOOM = 1.06;

export function CarTransitionProvider({ children }: { children: ReactNode }) {
  const [direction, setDirection] = useState<Direction>(null);
  const onDoneRef = useRef<(() => void) | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoom = useRef(new Animated.Value(HOME_ZOOM)).current;

  const forwardPlayer = useVideoPlayer(FORWARD_SOURCE, (p) => {
    p.loop = false;
    p.muted = true;
  });
  const reversePlayer = useVideoPlayer(REVERSE_SOURCE, (p) => {
    p.loop = false;
    p.muted = true;
  });

  const finish = useCallback(() => {
    onDoneRef.current?.();
    onDoneRef.current = null;
    hideTimer.current = setTimeout(() => setDirection(null), HANDOFF_DELAY_MS);
  }, []);

  useEffect(() => {
    const sub = forwardPlayer.addListener("playToEnd", () => {
      if (direction === "forward") finish();
    });
    return () => sub.remove();
  }, [forwardPlayer, direction, finish]);

  useEffect(() => {
    const sub = reversePlayer.addListener("playToEnd", () => {
      if (direction === "reverse") finish();
    });
    return () => sub.remove();
  }, [reversePlayer, direction, finish]);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    []
  );

  const playForward = useCallback(
    (onDone: () => void) => {
      onDoneRef.current = onDone;
      forwardPlayer.currentTime = 0;
      forwardPlayer.play();
      setDirection("forward");
      zoom.setValue(HOME_ZOOM);
      Animated.timing(zoom, {
        toValue: DETAIL_ZOOM,
        duration: CLIP_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start();
    },
    [forwardPlayer, zoom]
  );

  const playReverse = useCallback(
    (onDone: () => void) => {
      onDoneRef.current = onDone;
      reversePlayer.currentTime = 0;
      reversePlayer.play();
      setDirection("reverse");
      zoom.setValue(DETAIL_ZOOM);
      Animated.timing(zoom, {
        toValue: HOME_ZOOM,
        duration: CLIP_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start();
    },
    [reversePlayer, zoom]
  );

  return (
    <CarTransitionContext.Provider value={{ playForward, playReverse }}>
      {children}
      {direction && (
        <Animated.View
          style={[StyleSheet.absoluteFill, { transform: [{ scale: zoom }] }]}
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
