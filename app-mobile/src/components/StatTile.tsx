import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../theme";

interface Props {
  label: string;
  value: string;
  unit?: string;
}

export function StatTile({ label, value, unit }: Props) {
  return (
    <View style={styles.tile}>
      <Text style={styles.value}>
        {value}
        {unit ? <Text style={styles.unit}> {unit}</Text> : null}
      </Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    gap: spacing.xs,
  },
  value: { ...typography.statValue, color: colors.textPrimary },
  unit: { ...typography.caption, color: colors.textTertiary },
  label: { ...typography.statLabel, color: colors.textTertiary, textTransform: "uppercase" },
});
