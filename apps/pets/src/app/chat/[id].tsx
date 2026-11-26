import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Empty } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { api, errorText, sized, timeAgo, type Message } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePets } from '@/lib/pets';

type ThreadInfo = { id: string; slug: string; breed: string; role: 'buyer' | 'seller'; with: string; photo: string | null; live: boolean; reported: boolean };

// One conversation (/api/dm/thread), or with id "new" and a slug, the first
// message to a pet's seller (/api/dm/send { slug, body }).
export default function Chat() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { id, slug } = useLocalSearchParams<{ id: string; slug?: string }>();
  const isNew = id === 'new';
  const { account } = useAuth();
  const { pets } = usePets();
  const [thread, setThread] = useState<ThreadInfo | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(isNew ? [] : null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [warn, setWarn] = useState(false);
  const list = useRef<FlatList<Message>>(null);

  const pet = isNew ? pets?.find((p) => p.slug === slug) : null;

  const load = useCallback(async () => {
    if (isNew) return;
    try {
      const r = await api<{ thread: ThreadInfo; messages: Message[] }>(`/api/dm/thread?id=${encodeURIComponent(id)}`);
      setThread(r.thread);
      setMessages(r.messages);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [id, isNew]);

  // New messages every 20 seconds while the conversation is open, as on the site.
  useEffect(() => {
    if (!account || isNew) return;
    load();
    const timer = setInterval(load, 20_000);
    return () => clearInterval(timer);
  }, [account, isNew, load]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      const r = await api<{ thread_id: string; warn: boolean }>(
        '/api/dm/send',
        isNew ? { slug, body, src: { page: 'app' } } : { thread_id: id, body },
      );
      setText('');
      setWarn(Boolean(r.warn));
      if (isNew) router.replace({ pathname: '/chat/[id]', params: { id: r.thread_id } });
      else await load();
    } catch (e) {
      Alert.alert('Not sent', errorText(e));
    } finally {
      setSending(false);
    }
  }

  function report() {
    Alert.prompt
      ? Alert.prompt('Report this conversation', 'Tell us what went wrong.', (reason) => doReport(reason || ''))
      : Alert.alert('Report this conversation?', 'PuppyPlace will review it.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Report', style: 'destructive', onPress: () => doReport('Reported from the app') },
        ]);
  }

  async function doReport(reason: string) {
    try {
      await api('/api/dm/report', { thread_id: id, reason });
      Alert.alert('Thank you', 'PuppyPlace will look into it.');
    } catch (e) {
      Alert.alert('Not sent', errorText(e));
    }
  }

  if (!account) {
    return <Empty icon="lock-closed-outline" title="Sign in to see your messages" />;
  }

  const title = isNew ? pet?.breed || 'New message' : thread ? `${thread.with} · ${thread.breed}` : 'Messages';
  const photo = isNew ? pet?.image_url : thread?.photo;
  const petSlug = isNew ? slug : thread?.slug;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <Stack.Screen
        options={{
          title,
          headerRight: isNew
            ? undefined
            : () => <Ionicons name="flag-outline" size={22} color={t.danger} accessibilityLabel="Report" onPress={report} />,
        }}
      />
      {petSlug ? (
          <Pressable
            onPress={() => router.push({ pathname: '/pet/[slug]', params: { slug: petSlug } })}
            style={[styles.petBar, { borderColor: t.border, backgroundColor: t.surface }]}>
            {photo ? <Image source={sized(photo, 200)} style={styles.petPhoto} /> : null}
            <Text style={{ color: t.text, fontWeight: '800', flex: 1 }} numberOfLines={1}>
              {isNew ? pet?.breed : thread?.breed}
            </Text>
            <Text style={{ color: t.brand, fontWeight: '800' }}>View pet</Text>
          </Pressable>
      ) : null}

      {messages === null ? (
        error ? (
          <Empty icon="cloud-offline-outline" title="Couldn't open this conversation" text={error} />
        ) : (
          <View style={styles.center}>
            <ActivityIndicator color={t.brand} />
          </View>
        )
      ) : (
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(m, i) => `${m.created_at}-${i}`}
          contentContainerStyle={{ padding: 12, gap: 8, flexGrow: 1 }}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          ListHeaderComponent={
            <Text style={[styles.notice, { color: t.textSecondary, backgroundColor: t.surface }]}>
              🔒 Your number stays private. Never pay a deposit before you have seen the pet.
            </Text>
          }
          ListEmptyComponent={
            isNew ? (
              <Text style={[styles.hint, { color: t.textSecondary }]}>
                Ask the seller about the pet. They get your message on WhatsApp and reply here.
              </Text>
            ) : undefined
          }
          renderItem={({ item }) => (
            <View
              style={[
                styles.bubble,
                item.mine
                  ? { alignSelf: 'flex-end', backgroundColor: t.brand }
                  : { alignSelf: 'flex-start', backgroundColor: t.surface },
              ]}>
              <Text style={{ color: item.mine ? t.onBrand : t.text, fontSize: 15, lineHeight: 21 }}>{item.body}</Text>
              <Text style={{ color: item.mine ? 'rgba(255,255,255,0.8)' : t.textSecondary, fontSize: 11, marginTop: 4 }}>
                {timeAgo(item.created_at)}
              </Text>
            </View>
          )}
        />
      )}

      {warn ? (
        <Text style={[styles.warn, { color: t.danger }]}>
          ⚠️ Talking about deposits or bank transfers? Don't pay before you have met the seller and seen the pet.
        </Text>
      ) : null}

      <View style={[styles.composer, { borderColor: t.border, paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={isNew ? 'Hi, is this pet still available?' : 'Write a reply'}
          placeholderTextColor={t.textSecondary}
          multiline
          maxLength={1000}
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
        />
        <Pressable
          onPress={send}
          disabled={sending || !text.trim()}
          accessibilityLabel="Send"
          style={[styles.send, { backgroundColor: t.brand, opacity: sending || !text.trim() ? 0.5 : 1 }]}>
          {sending ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  petBar: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderBottomWidth: 1 },
  petPhoto: { width: 40, height: 40, borderRadius: 8 },
  notice: { fontSize: 12, padding: 10, borderRadius: 10, marginBottom: 8, lineHeight: 17 },
  hint: { fontSize: 14, textAlign: 'center', marginTop: 24, paddingHorizontal: 20, lineHeight: 20 },
  bubble: { maxWidth: '82%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  warn: { fontSize: 13, fontWeight: '700', paddingHorizontal: 12, paddingVertical: 6 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 10, paddingTop: 10, borderTopWidth: 1 },
  input: { flex: 1, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 15, maxHeight: 120 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
