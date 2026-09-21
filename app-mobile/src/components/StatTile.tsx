/**
 * Statistica in chiaro sopra la fotografia: niente card, niente bordo,
 * niente sfondo. Nei riferimenti il dato galleggia sull'immagine e a
 * separarlo dal vicino basta lo spazio, non una scatola. Gerarchia in tre
 * livelli: glifo sottile, numero grande, etichetta minuscola in maiuscolo.
 */
import type { ComponentType } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";
import type { IconProps } from "./icons";

interface Props {
  Icon: ComponentType<IconProps>;
  label: string;
  value: string;
  unit?: string;
}

export function StatTile({ Icon, label, value, unit }: Props) {
  return (
    <View style={styles.tile}>
      <Icon size={19} color="rgba(255,255,255,0.72)" strokeWidth={1.25} />
      <Text style={styles.value} numberOfLines={1}>
        {value}
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, alignItems: "center", gap: 7 },
  value: { fontSize: 25, fontWeight: "600", color: colors.textPrimary, letterSpacing: -0.6 },
  unit: { fontSize: 13, fontWeight: "500", color: colors.textSecondary, letterSpacing: 0 },
  label: {
    fontSize: 9.5,
    fontWeight: "500",
    color: "rgba(255,255,255,0.42)",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
});
