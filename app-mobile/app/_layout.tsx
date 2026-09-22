import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colors } from "../src/theme";

export default function RootLayout() {
  return (
    <>
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
    </>
  );
}
