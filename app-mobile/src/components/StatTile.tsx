import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../theme";

interface Props {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  unit?: string;
}

export function StatTile({ icon, label, value, unit }: Props) {
  return (
    <View style={styles.tile}>
      {icon && (
        <View style={styles.badge}>
          <Ionicons name={icon} size={16} color={colors.accent} />
        </View>
      )}
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
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    gap: 6,
  },
  badge: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  value: { ...typography.statValue, color: colors.textPrimary },
  unit: { ...typography.caption, color: colors.textTertiary },
  label: { ...typography.statLabel, color: colors.textTertiary, textTransform: "uppercase" },
});
