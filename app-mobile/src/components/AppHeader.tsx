/**
 * La riga in alto (menu · monogramma · avatar) e' identica su tutte le
 * schermate: nei riferimenti e' l'elemento che tiene insieme le pagine,
 * quindi vive in un solo componente invece di essere ricopiata.
 */
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Line } from "react-native-svg";
import { colors, spacing } from "../theme";
import { MercedesLogo } from "./MercedesLogo";

export function AppHeader() {
  // insets.top varia molto per dispositivo (Dynamic Island ~59, notch
  // classico ~47, nessuno ~20/44): un padding fisso andava bene solo su
  // alcuni. Con l'inset la riga scende sempre appena sotto l'area di
  // sistema, isola compresa.
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.row, { paddingTop: insets.top + spacing.sm }]}>
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Line x1="3" y1="7.5" x2="21" y2="7.5" stroke="rgba(255,255,255,0.85)" strokeWidth={1.4} strokeLinecap="round" />
        <Line x1="3" y1="12.5" x2="15" y2="12.5" stroke="rgba(255,255,255,0.85)" strokeWidth={1.4} strokeLinecap="round" />
        <Line x1="3" y1="17.5" x2="18" y2="17.5" stroke="rgba(255,255,255,0.85)" strokeWidth={1.4} strokeLinecap="round" />
      </Svg>

      <View style={styles.monogram}>
        <MercedesLogo size={56} />
      </View>

      <View style={styles.avatar}>
        <Text style={styles.avatarLabel}>A</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
  },
  /**
   * Niente piu' anello/badge intorno: solo la stella, piu' grande
   * (almeno 2.5x) cosi' regge da sola come elemento centrale della riga
   * invece che stare chiusa in un cerchietto di 30px.
   */
  monogram: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLabel: { color: colors.textPrimary, fontSize: 11, fontWeight: "600" },
});
