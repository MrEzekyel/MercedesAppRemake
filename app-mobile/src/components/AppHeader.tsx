/**
 * La riga in alto (il logo) e' identica su tutte le
 * schermate: nei riferimenti e' l'elemento che tiene insieme le pagine,
 * quindi vive in un solo componente invece di essere ricopiata.
 */
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing } from "../theme";
import { MercedesLogo } from "./MercedesLogo";

export function AppHeader() {
  const insets = useSafeAreaInsets();

  // Solo il logo: le sezioni stanno tutte nella tab bar e non c'e' un
  // profilo, quindi menu e avatar erano solo decorazione. L'altezza resta
  // quella di prima, cosi' saluto e contenuti non si spostano.
  return (
    <View style={[styles.row, { paddingTop: insets.top + spacing.sm }]}>
      <MercedesLogo size={56} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
});
