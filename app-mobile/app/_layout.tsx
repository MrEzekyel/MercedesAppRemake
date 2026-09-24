import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CarTransitionProvider } from "../src/components/CarTransition";
import { colors } from "../src/theme";

/**
 * SafeAreaProvider qui in radice: AppHeader (e il pulsante indietro di
 * vehicle-detail) leggono insets.top per scendere sotto la Dynamic Island
 * invece di usare un padding fisso. Senza il Provider, useSafeAreaInsets()
 * nei componenti figli restituirebbe sempre zero.
 *
 * CarTransitionProvider avvolge lo Stack (non viceversa) perche' il suo
 * overlay video deve comparire SOPRA qualunque schermata durante il
 * cambio pagina Home <-> dettaglio veicolo.
 */
const SUBPAGE = { headerShown: false, animation: "fade", animationDuration: 220 } as const;

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <CarTransitionProvider>
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
          <Stack.Screen
            name="vehicle-detail"
            options={{
              headerShown: false,
              // La transizione e' il video, non lo scorrimento nativo: la
              // combinazione dei due si vedrebbe come un doppio movimento.
              // Lo swipe-back e' disattivato per lo stesso motivo: l'unica
              // via d'uscita e' il pulsante indietro, che innesca il video
              // al contrario invece di saltarlo con un gesto.
              animation: "none",
              gestureEnabled: false,
            }}
          />
          <Stack.Screen name="refuels" options={{ title: "Rifornimenti" }} />
          {/* Approfondimenti di Viaggi: header, saluto e tab bar sono gli
              stessi della tab, quindi con la dissolvenza restano fermi e
              cambia solo il contenuto. Uno scorrimento laterale li
              trascinerebbe via con la pagina. */}
          <Stack.Screen name="consumption" options={SUBPAGE} />
          <Stack.Screen name="habits" options={SUBPAGE} />
          <Stack.Screen name="records" options={SUBPAGE} />
          <Stack.Screen name="compare" options={SUBPAGE} />
          <Stack.Screen name="trip/[id]" options={SUBPAGE} />
          <Stack.Screen name="place/[id]" options={{ headerShown: false, presentation: "modal" }} />
          <Stack.Screen
            name="refuel/[id]"
            options={{ title: "Conferma rifornimento", presentation: "modal" }}
          />
        </Stack>
      </CarTransitionProvider>
    </SafeAreaProvider>
  );
}
