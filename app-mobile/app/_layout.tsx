import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "../src/theme";

/**
 * SafeAreaProvider qui in radice: AppHeader (e il pulsante indietro di
 * vehicle-detail) leggono insets.top per scendere sotto la Dynamic Island
 * invece di usare un padding fisso. Senza il Provider, useSafeAreaInsets()
 * nei componenti figli restituirebbe sempre zero.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          headerShadowVisible: false,
          // headerBackTitle da solo non basta: iOS ripiega sul nome della
          // rotta precedente, che e' il gruppo "(tabs)".
          headerBackTitle: "",
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="vehicle-detail" options={{ headerShown: false }} />
        <Stack.Screen name="refuels" options={{ title: "Rifornimenti" }} />
        <Stack.Screen name="consumption" options={{ title: "Consumi" }} />
        <Stack.Screen name="trip/[id]" options={{ title: "Viaggio" }} />
        <Stack.Screen
          name="refuel/[id]"
          options={{ title: "Conferma rifornimento", presentation: "modal" }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}
