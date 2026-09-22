/**
 * Swipe orizzontale per passare da una tab all'altra, in aggiunta al tocco
 * sulla tab bar. Un PanResponder invece di una libreria di paginazione:
 * le tre schermate restano tre route indipendenti (ognuna carica i propri
 * dati al focus), non pagine di un'unica vista scorrevole.
 *
 * La soglia sull'angolo del gesto (dx nettamente piu' grande di dy) e'
 * quello che lascia convivere lo swipe con lo scroll verticale delle
 * ScrollView delle schermate: un gesto verticale non viene mai catturato
 * qui, resta alla ScrollView.
 */
import { useRef } from "react";
import { PanResponder } from "react-native";

interface Options {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

const MIN_DISTANCE = 60;

export function useSwipeNav({ onSwipeLeft, onSwipeRight }: Options) {
  return useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        Math.abs(gesture.dx) > 16 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2.2,
      onPanResponderRelease: (_evt, gesture) => {
        if (gesture.dx <= -MIN_DISTANCE) onSwipeLeft?.();
        else if (gesture.dx >= MIN_DISTANCE) onSwipeRight?.();
      },
    })
  ).current.panHandlers;
}
