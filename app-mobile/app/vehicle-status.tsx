import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../src/theme";

/**
 * Placeholder: la lista completa dei dati disponibili e' stata condivisa
 * in chat per decidere insieme come presentarla (gomme, porte, finestrini,
 * eco-score, tagliando, batteria 12V...). Questa schermata esiste solo
 * come punto d'arrivo della scorciatoia da Rifornimenti.
 */
export default function VehicleStatusScreen() {
  return (
    <View style={styles.screen}>
      <Ionicons name="construct-outline" size={40} color={colors.textTertiary} />
      <Text style={styles.title}>Stato del veicolo</Text>
      <Text style={styles.body}>In arrivo: gomme, porte, finestrini, eco-score e avvisi.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.lg,
  },
  title: { ...typography.title, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textTertiary, textAlign: "center" },
});
