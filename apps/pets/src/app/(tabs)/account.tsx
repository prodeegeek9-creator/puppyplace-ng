import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Empty } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { api, errorText, photosOf, priceLabel, SITE, sized, soldWord, type Pet } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fetchPets } from '@/lib/pets';

type Stats = Record<string, { views?: number; views_week?: number; whatsapp?: number; messages?: number }>;
type Edit = { id: string; pet_id: string; kind: string; status: string };

const LINKS = [
  { title: 'Visit puppyplace.ng', path: '/' },
  { title: 'Help & FAQ', path: '/faq.html' },
  { title: 'Terms', path: '/terms.html' },
  { title: 'Privacy', path: '/privacy.html' },
];

export default function AccountTab() {
  const t = useTheme();
  const { account, signOut, refresh: refreshMe } = useAuth();
  const [listings, setListings] = useState<Pet[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [edits, setEdits] = useState<Edit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ listings: Pet[]; stats: Stats | null; edits: Edit[] }>('/api/me');
      setListings(r.listings || []);
      setStats(r.stats);
      setEdits(r.edits || []);
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

  const links = (
    <View style={{ marginTop: 24 }}>
      {LINKS.map((l) => (
        <Pressable key={l.path} onPress={() => WebBrowser.openBrowserAsync(`${SITE}${l.path}`)} style={[styles.link, { borderColor: t.border }]}>
          <Text style={{ color: t.text, fontSize: 15, fontWeight: '600' }}>{l.title}</Text>
          <Ionicons name="open-outline" size={16} color={t.textSecondary} />
        </Pressable>
      ))}
    </View>
  );

  if (!account) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Empty icon="person-circle-outline" title="Sign in to PuppyPlace" text="Message sellers, list your pets and manage your listings. The same account as on puppyplace.ng.">
          <Button title="Sign in with WhatsApp" icon="logo-whatsapp" onPress={() => router.push('/sign-in')} style={{ marginTop: 8 }} />
        </Empty>
        {links}
      </ScrollView>
    );
  }

  async function setSold(p: Pet, sold: boolean) {
    try {
      await api('/api/me/sold', { pet_id: p.id, sold });
      await Promise.all([load(), fetchPets(true).catch(() => {}), refreshMe()]);
    } catch (e) {
      Alert.alert('Could not update', errorText(e));
    }
  }

  function status(p: Pet) {
    if (p.active === false) return { text: '⏳ Waiting for approval', color: t.textSecondary };
    if (p.sold_at) return { text: `🏷️ ${soldWord(p)}`, color: t.textSecondary };
    return { text: '✅ Live', color: t.success };
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
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
      }>
      <View style={[styles.card, { backgroundColor: t.surface }]}>
        <Text style={[styles.hello, { color: t.text }]}>Hi{account.name ? `, ${account.name}` : ''} 👋</Text>
        <Text style={{ color: t.textSecondary, marginTop: 2 }}>+{account.phone}</Text>
      </View>

      <Text style={[styles.h, { color: t.text }]}>My listings</Text>
      {error ? <Text style={{ color: t.danger }}>{error}</Text> : null}
      {listings && !listings.length ? (
        <Empty icon="paw-outline" title="No listings yet" text="Sell or rehome a pet from the List a pet tab.">
          <Button title="List a pet" onPress={() => router.navigate('/sell')} style={{ marginTop: 8 }} />
        </Empty>
      ) : null}
      {(listings || []).map((p) => {
        const s = status(p);
        const n = stats?.[String(p.id)];
        const photo = photosOf(p)[0];
        const pendingEdit = edits.some((e) => String(e.pet_id) === String(p.id) && e.status === 'pending');
        const row = (
          <View style={[styles.listing, { borderColor: t.border }]}>
            <View style={[styles.thumb, { backgroundColor: t.surface }]}>
              {photo ? <Image source={sized(photo, 200)} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: t.text, fontWeight: '800', fontSize: 15 }} numberOfLines={1}>
                {p.breed}
              </Text>
              <Text style={{ color: t.brand, fontWeight: '800' }}>{priceLabel(p)}</Text>
              <Text style={{ color: s.color, fontSize: 13, fontWeight: '700' }}>
                {s.text}
                {pendingEdit ? ' · change under review' : ''}
              </Text>
              {n ? (
                <Text style={{ color: t.textSecondary, fontSize: 12 }}>
                  👁 {n.views ?? 0} views · 💬 {(n.whatsapp ?? 0) + (n.messages ?? 0)} buyers
                </Text>
              ) : null}
              {p.active !== false ? (
                <Pressable onPress={() => setSold(p, !p.sold_at)} hitSlop={8}>
                  <Text style={{ color: t.brand, fontWeight: '800', fontSize: 13, marginTop: 4 }}>
                    {p.sold_at ? 'Mark as available again' : `Mark as ${soldWord(p).toLowerCase()}`}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
        return p.active !== false ? (
          <Pressable key={String(p.id)} onPress={() => router.push({ pathname: '/pet/[slug]', params: { slug: p.slug } })}>
            {row}
          </Pressable>
        ) : (
          <View key={String(p.id)}>{row}</View>
        );
      })}
      {listings?.length ? (
        <Pressable onPress={() => WebBrowser.openBrowserAsync(`${SITE}/my-listings.html`)}>
          <Text style={{ color: t.textSecondary, fontSize: 13, marginTop: 10, lineHeight: 19 }}>
            To change the price, photos or details, use My listings on puppyplace.ng (sign in there with the same number). Tap to open.
          </Text>
        </Pressable>
      ) : null}

      {links}
      <Button
        title="Log out"
        kind="outline"
        onPress={() =>
          Alert.alert('Log out?', undefined, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Log out', style: 'destructive', onPress: signOut },
          ])
        }
        style={{ marginTop: 24 }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 14 },
  hello: { fontSize: 20, fontWeight: '900' },
  h: { fontSize: 18, fontWeight: '900', marginTop: 24, marginBottom: 8 },
  listing: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  thumb: { width: 72, height: 72, borderRadius: 12, overflow: 'hidden' },
  link: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
});
