import { Nunito_900Black } from '@expo-google-fonts/nunito';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import { useTheme } from '@/constants/theme';
import { AuthProvider } from '@/lib/auth';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const scheme = useColorScheme();
  const t = useTheme();
  // The website's fonts, so the home screen looks like puppyplace.ng/pets.html
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    Nunito_900Black,
  });
  const ready = fontsLoaded || Boolean(fontError);
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!ready) return null;
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <AuthProvider>
      <ThemeProvider
        value={{ ...base, colors: { ...base.colors, primary: t.brand, background: t.background, card: t.background, text: t.text, border: t.border } }}>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerTintColor: t.brand, headerTitleStyle: { color: t.text, fontWeight: '800' } }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="pet/[slug]" options={{ title: '' }} />
          <Stack.Screen name="chat/[id]" options={{ title: 'Messages' }} />
          <Stack.Screen name="sign-in" options={{ presentation: 'modal', title: 'Sign in' }} />
        </Stack>
      </ThemeProvider>
    </AuthProvider>
  );
}
