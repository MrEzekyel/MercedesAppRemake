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
import { Animated, Easing, StyleSheet, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import type { VehicleState } from "../types";
import { AppHeader } from "./AppHeader";
import { AppTabBar } from "./AppTabBar";
import { VehicleGreeting } from "./VehicleGreeting";

type Direction = "forward" | "reverse" | null;

interface CarTransitionApi {
  /**
   * Home -> dettaglio. `state` e' lo stato veicolo gia' a schermo: serve a
   * ridisegnare il saluto sopra il video identico a quello sotto.
   */
  playForward: (onDone: () => void, state: VehicleState | null) => void;
  /** Dettaglio -> Home, stesso principio al contrario. */
  playReverse: (onDone: () => void, state: VehicleState | null) => void;
  /** Ultimo stato passato a una transizione: il dettaglio parte da qui. */
  getLastVehicleState: () => VehicleState | null;
  /**
   * Opacita' condivisa per il contenuto "informativo" sovrapposto alla
   * foto (pannello comandi, statistiche) — non per la foto, ne' per
   * header, saluto e tab bar, che restano fermi. Resta a 1 fuori da una
   * transizione; viene azzerata al tocco e riportata a 1 in dissolvenza
   * dopo il taglio video -> foto. E' condivisa perche' a ogni transizione
   * solo la schermata di ARRIVO deve restare invisibile finche' non tocca
   * a lei; quella di partenza e' comunque coperta dal video.
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

// Durata dei due mp4. Il taglio video -> foto avviene su playToEnd, non
// su questo valore: qui serve per lo zoom e come rete di sicurezza.
const CLIP_DURATION_MS = 750;
// Largo: al primo avvio dopo il lancio il player puo' metterci ~1,3s.
const END_FALLBACK_MS = 2500;

// Stessa curva con cui sono stati ritemporizzati i due mp4 (ease-in-out
// sinusoidale): lo zoom accelera e rallenta insieme all'auto.
const CLIP_EASING = Easing.inOut(Easing.sin);

// Dissolvenza della UI (pannello, statistiche) DOPO il taglio — mai del
// video, che non sfuma (vedi overlayOpacity).
const FADE_MS = 220;

// Le due schermate statiche zoomano la foto di una quantita' leggermente
// diversa (VehicleHeroCard.tsx usa 1.09, vehicle-detail.tsx usa 1.06): il
// video deve iniziare/finire esattamente su quegli stessi valori, non su
// uno zoom fisso, altrimenti il fotogramma di passaggio non combacia con
// la schermata sotto e si vede uno scatto.
const HOME_ZOOM = 1.09;
const DETAIL_ZOOM = 1.06;

export function CarTransitionProvider({ children }: { children: ReactNode }) {
  const [direction, setDirection] = useState<Direction>(null);
  const [lastVehicleState, setLastVehicleState] = useState<VehicleState | null>(null);
  // Anche in un ref: il dettaglio lo legge al primo render, che puo'
  // avvenire prima che lo useState qui sopra sia stato applicato.
  const lastVehicleStateRef = useRef<VehicleState | null>(null);
  const getLastVehicleState = useCallback(() => lastVehicleStateRef.current, []);
  const cleanup = useRef<(() => void) | null>(null);
  const zoom = useRef(new Animated.Value(HOME_ZOOM)).current;
  // Non sfuma MAI: o e' invisibile a riposo o del tutto opaca per l'intera
  // clip. Video e foto sotto sono lo stesso fotogramma, quindi il passaggio
  // di scatto e' invisibile; sfumarlo lascerebbe vedere in trasparenza
  // quello che c'e' dietro nel frattempo.
  const overlayOpacity = useRef(new Animated.Value(0)).current;
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
    (
      which: Direction,
      player: typeof forwardPlayer,
      from: number,
      to: number,
      onDone: () => void,
      state: VehicleState | null
    ) => {
      cleanup.current?.();

      lastVehicleStateRef.current = state;
      setLastVehicleState(state);
      overlayOpacity.setValue(1);
      contentOpacity.setValue(0);
      zoom.setValue(from);

      // Lo zoom parte subito, non su playingChange: misurato, il player
      // arriva in fondo ~770ms dopo il tocco (parte quasi subito), mentre
      // l'evento playingChange arriva solo dopo ~230ms. Aspettarlo lasciava
      // lo zoom a meta' strada al momento del taglio.
      Animated.timing(zoom, {
        toValue: to,
        duration: CLIP_DURATION_MS,
        easing: CLIP_EASING,
        useNativeDriver: true,
      }).start();

      // Il video sparisce di colpo quando e' davvero arrivato all'ultimo
      // fotogramma (identico alla foto sotto), non dopo 750ms fissi: con
      // un timer, se il player partiva in ritardo, il taglio arrivava a
      // video non ancora finito e l'auto "saltava" all'immagine finale.
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        cleanup.current?.();
        cleanup.current = null;
        zoom.stopAnimation();
        zoom.setValue(to);
        setDirection(null);
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: FADE_MS,
          easing: Easing.linear,
          useNativeDriver: true,
        }).start();
      };

      const endSub = player.addListener("playToEnd", finish);
      const endFallback = setTimeout(finish, END_FALLBACK_MS);
      cleanup.current = () => {
        endSub.remove();
        clearTimeout(endFallback);
      };

      // replay() riavvolge e basta ("Seeks the playback to the beginning"
      // nei tipi di expo-video): NON fa ripartire la riproduzione. play()
      // subito dopo e' quello che lo mette davvero in moto.
      player.replay();
      player.play();
      setDirection(which);

      // Si naviga SUBITO: il video copre lo schermo per tutta la clip, e
      // la schermata di arrivo ha tutto quel tempo per montarsi sotto.
      onDone();
    },
    [zoom, overlayOpacity, contentOpacity]
  );

  const playForward = useCallback(
    (onDone: () => void, state: VehicleState | null) =>
      run("forward", forwardPlayer, HOME_ZOOM, DETAIL_ZOOM, onDone, state),
    [run, forwardPlayer]
  );

  const playReverse = useCallback(
    (onDone: () => void, state: VehicleState | null) =>
      run("reverse", reversePlayer, DETAIL_ZOOM, HOME_ZOOM, onDone, state),
    [run, reversePlayer]
  );

  return (
    <CarTransitionContext.Provider
      value={{ playForward, playReverse, getLastVehicleState, contentOpacity }}
    >
      {children}
      {/* VideoView montata solo durante una transizione, smontata a riposo. */}
      {direction && (
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: overlayOpacity, transform: [{ scale: zoom }] }]}
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
      {/*
        Header, saluto e tab bar sono identici nelle due schermate: il video
        vive in radice e altrimenti li coprirebbe per tutta la clip. Li
        ridisegna sopra, con gli stessi componenti, cosi' restano fermi.
      */}
      {direction && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <AppHeader />
          <VehicleGreeting state={lastVehicleState} />
          <AppTabBar active="index" />
        </View>
      )}
    </CarTransitionContext.Provider>
  );
}
