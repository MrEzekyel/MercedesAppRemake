/**
 * All'apertura: il logo Mercedes grande su nero per due secondi, poi il logo
 * sfuma e l'app compare in dissolvenza dal nero.
 *
 * Lo splash nativo (expo-splash-screen in app.json) mostra lo stesso logo,
 * alla stessa misura e posizione, mentre il JavaScript si carica: questo
 * overlay lo sostituisce senza stacchi e ne prolunga la durata.
 */
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet } from "react-native";
import { MercedesLogo } from "./MercedesLogo";

/** Deve coincidere con imageWidth del plugin expo-splash-screen in app.json. */
const LOGO_SIZE = 200;
/** Da quando parte il JavaScript: lo splash nativo prima e' tempo di caricamento. */
const LOGO_MS = 2000;
const LOGO_FADE_MS = 450;
const APP_FADE_MS = 550;

const launchedAt = Date.now();
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ fade: false });

export function LaunchSplash() {
  const [done, setDone] = useState(false);
  const logo = useRef(new Animated.Value(1)).current;
  const veil = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Due frame di attesa: il logo SVG e' disegnato, lo splash nativo puo'
    // sparire sotto un'immagine identica.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => SplashScreen.hideAsync().catch(() => {}));
    });
    const timer = setTimeout(() => {
      Animated.sequence([
        Animated.timing(logo, { toValue: 0, duration: LOGO_FADE_MS, useNativeDriver: true }),
        Animated.timing(veil, { toValue: 0, duration: APP_FADE_MS, useNativeDriver: true }),
      ]).start(() => setDone(true));
    }, Math.max(0, launchedAt + LOGO_MS - Date.now()));
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [logo, veil]);

  if (done) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.veil, { opacity: veil }]}>
      <Animated.View style={{ opacity: logo }}>
        <MercedesLogo size={LOGO_SIZE} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  veil: { backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
});
