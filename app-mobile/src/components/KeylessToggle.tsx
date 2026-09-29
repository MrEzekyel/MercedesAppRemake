/**
 * Interruttore del keyless (src/keyless/engine.ts). Per funzionare ad app
 * chiusa serve la posizione "Sempre": se iOS concede solo "Mentre usi
 * l'app", l'interruttore torna spento e spiega dove cambiarla.
 */
import * as Location from "expo-location";
import { useState } from "react";
import { Alert, Linking, StyleSheet, Switch, Text, View } from "react-native";
import { handleWake, stopKeyless } from "../keyless/engine";
import { loadState, saveState } from "../keyless/store";
import { keylessAvailable } from "../keyless/tasks";
import { colors, radius, spacing } from "../theme";
import { LockIcon } from "./icons";

export function KeylessToggle() {
  const [enabled, setEnabled] = useState(() => keylessAvailable && loadState().enabled);
  const [busy, setBusy] = useState(false);
  if (!keylessAvailable) return null;

  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      if (!on) {
        await stopKeyless();
        setEnabled(false);
        return;
      }
      const foreground = await Location.requestForegroundPermissionsAsync();
      const background = foreground.granted ? await Location.requestBackgroundPermissionsAsync() : null;
      if (!background?.granted) {
        Alert.alert(
          "Serve la posizione \"Sempre\"",
          "Per chiudere l'auto quando ti allontani, anche ad app chiusa, Classe A deve poter usare la posizione sempre. Cambiala in Impostazioni › Classe A › Posizione.",
          [
            { text: "Annulla", style: "cancel" },
            { text: "Impostazioni", onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }
      saveState({ ...loadState(), enabled: true, parkingId: null });
      setEnabled(true);
      await handleWake({ kind: "app" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.row}>
      <LockIcon size={18} color={colors.accent} strokeWidth={1.3} />
      <View style={styles.text}>
        <Text style={styles.title}>Keyless</Text>
        <Text style={styles.caption}>
          Chiude l'auto se ti allontani e la lasci aperta, e quando torni ti propone di aprirla
        </Text>
      </View>
      <Switch
        value={enabled}
        disabled={busy}
        onValueChange={toggle}
        trackColor={{ true: colors.accent }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  caption: { fontSize: 11.5, color: "rgba(255,255,255,0.45)" },
});
