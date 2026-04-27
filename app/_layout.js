import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StripeProvider } from "@stripe/stripe-react-native";


export default function RootLayout() {
  return (
    <StripeProvider publishableKey="pk_test_51TOZMyDCPcybtBFUz20h4JUsRZA0YA1SzYU5NyyZcwGETcNZqAiF0d59LJjAKx443bsiC2vwWpk8CENAXkEKk3xR004PaM6KbT">
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            animation: "slide_from_right",
            contentStyle: {
              backgroundColor: "#fff",
            },
          }}
        />
      </SafeAreaProvider>
    </StripeProvider>
  );
}