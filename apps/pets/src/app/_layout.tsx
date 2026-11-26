import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import { useTheme } from '@/constants/theme';
import { AuthProvider } from '@/lib/auth';

export default function RootLayout() {
  const scheme = useColorScheme();
  const t = useTheme();
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
