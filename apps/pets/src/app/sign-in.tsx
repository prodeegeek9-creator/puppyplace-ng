import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';

import { Button, Field } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';

// The website's sign in: WhatsApp number → 6-digit code on WhatsApp → signed in.
export default function SignIn() {
  const t = useTheme();
  const { why } = useLocalSearchParams<{ why?: string }>();
  const { sendCode, verify } = useAuth();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);

  async function ask() {
    setBusy(true);
    setMsg(null);
    try {
      await sendCode(phone);
      setStep('code');
      setMsg({ text: 'We sent a 6-digit code to your WhatsApp.', ok: true });
    } catch (e) {
      setMsg({ text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setMsg(null);
    try {
      await verify(phone, code, name);
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (e) {
      setMsg({ text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: t.text }]}>🐾 Sign in to PuppyPlace</Text>
        <Text style={[styles.p, { color: t.textSecondary }]}>
          {why ? `${why} ` : ''}No password: we send a code to your WhatsApp. It's the same account as on puppyplace.ng.
        </Text>

        {step === 'phone' ? (
          <>
            <Field
              label="WhatsApp number"
              value={phone}
              onChangeText={setPhone}
              placeholder="0803 123 4567"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              autoFocus
            />
            <Button title="Send code on WhatsApp" icon="logo-whatsapp" onPress={ask} busy={busy} disabled={!phone.trim()} style={{ marginTop: 18 }} />
          </>
        ) : (
          <>
            <Field
              label="6-digit code"
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              autoFocus
            />
            <Field label="Your first name" value={name} onChangeText={setName} placeholder="Ade" autoComplete="given-name" textContentType="givenName" />
            <Button title="Sign in" onPress={confirm} busy={busy} disabled={code.length !== 6} style={{ marginTop: 18 }} />
            <Button title="Use another number" kind="outline" onPress={() => { setStep('phone'); setCode(''); setMsg(null); }} style={{ marginTop: 10 }} />
          </>
        )}
        {msg ? <Text style={[styles.msg, { color: msg.ok ? t.success : t.danger }]}>{msg.text}</Text> : null}
        <Text style={[styles.small, { color: t.textSecondary }]}>PuppyPlace will never ask you for this code.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '900' },
  p: { fontSize: 14, lineHeight: 21, marginTop: 8 },
  msg: { fontSize: 14, fontWeight: '700', marginTop: 14, lineHeight: 20 },
  small: { fontSize: 12, marginTop: 18 },
});
