import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Button, Empty } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { api, errorText, sized, timeAgo, type Thread } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function Messages() {
  const t = useTheme();
  const { account } = useAuth();
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ threads: Thread[] }>('/api/dm/threads');
      setThreads(r.threads || []);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (account) load();
    }, [account, load]),
  );

  if (!account) {
    return (
      <Empty icon="chatbubbles-outline" title="Your messages" text="Sign in to message sellers and see their replies here.">
        <Button title="Sign in" onPress={() => router.push('/sign-in')} style={{ marginTop: 8 }} />
      </Empty>
    );
  }

  if (!threads) {
    return error ? (
      <Empty icon="cloud-offline-outline" title="Couldn't load messages" text={error}>
        <Button title="Try again" onPress={load} style={{ marginTop: 8 }} />
      </Empty>
    ) : (
      <View style={styles.center}>
        <ActivityIndicator color={t.brand} size="large" />
      </View>
    );
  }

  return (
    <FlatList
      data={threads}
      keyExtractor={(x) => x.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={t.brand}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
      contentContainerStyle={{ flexGrow: 1 }}
      ListEmptyComponent={
        <Empty icon="chatbubbles-outline" title="No messages yet" text="Open a pet and tap Message to ask the seller about it." />
      }
      renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id } })}
            style={[styles.row, { borderColor: t.border }]}>
            <View style={[styles.photo, { backgroundColor: t.surface }]}>
              {item.photo ? <Image source={sized(item.photo, 200)} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.line}>
                <Text numberOfLines={1} style={[styles.name, { color: t.text }]}>
                  {item.with}
                </Text>
                <Text style={{ color: t.textSecondary, fontSize: 12 }}>{timeAgo(item.last_message_at)}</Text>
              </View>
              <Text numberOfLines={1} style={{ color: t.textSecondary, fontSize: 13, fontWeight: '700' }}>
                {item.role === 'seller' ? 'About your ' : ''}
                {item.breed}
              </Text>
              <View style={styles.line}>
                <Text numberOfLines={1} style={{ color: item.unread ? t.text : t.textSecondary, fontSize: 14, flex: 1, fontWeight: item.unread ? '700' : '400' }}>
                  {item.last || ''}
                </Text>
                {item.unread ? (
                  <View style={[styles.badge, { backgroundColor: t.brand }]}>
                    <Text style={styles.badgeText}>{item.unread}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 12, padding: 14, borderBottomWidth: 1, alignItems: 'center' },
  photo: { width: 56, height: 56, borderRadius: 12, overflow: 'hidden' },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { fontSize: 16, fontWeight: '800', flex: 1 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '900' },
});
