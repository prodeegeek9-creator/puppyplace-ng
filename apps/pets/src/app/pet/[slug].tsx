import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Linking,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Empty } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { api, errorText, photosOf, priceLabel, SITE, sized, soldWord, timeAgo, TYPE_EMOJI } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fetchPets, usePets } from '@/lib/pets';

const W = Dimensions.get('window').width;

export default function PetPage() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { pets, error } = usePets();
  const { account, mySlugs, refresh: refreshMe } = useAuth();
  const [photo, setPhoto] = useState(0);
  const [busy, setBusy] = useState<'wa' | 'sold' | null>(null);

  const pet = pets?.find((p) => p.slug === slug);

  if (!pets && !error) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={t.brand} size="large" />
      </View>
    );
  }
  if (!pet) {
    return <Empty icon="paw-outline" title="This pet is no longer listed" text={error || 'It may have been sold or taken down.'} />;
  }

  const photos = photosOf(pet);
  const sold = Boolean(pet.sold_at);
  const mine = mySlugs.has(pet.slug);
  const url = `${SITE}/pets/${pet.slug}`;
  const needLogin = (why: string) => router.push({ pathname: '/sign-in', params: { why } });

  async function whatsapp() {
    if (!account) return needLogin('Sign in to chat with the seller on WhatsApp.');
    setBusy('wa');
    try {
      const r = await api<{ url: string }>(`/api/contact?slug=${encodeURIComponent(pet!.slug)}&pg=app`);
      await Linking.openURL(r.url);
    } catch (e) {
      Alert.alert('WhatsApp', errorText(e));
    } finally {
      setBusy(null);
    }
  }

  function message() {
    if (!account) return needLogin('Sign in to message the seller.');
    router.push({ pathname: '/chat/[id]', params: { id: 'new', slug: pet!.slug } });
  }

  async function markSold(value: boolean) {
    setBusy('sold');
    try {
      await api('/api/me/sold', { pet_id: pet!.id, sold: value });
      await Promise.all([fetchPets(true), refreshMe()]);
    } catch (e) {
      Alert.alert('Could not update', errorText(e));
    } finally {
      setBusy(null);
    }
  }

  const facts: [string, string | null | undefined][] = [
    ['Type', pet.type],
    ['Age', pet.age],
    ['Location', pet.location],
    ['Vaccinated', pet.vaccinated ? 'Yes' : 'Not stated'],
    ['Dewormed', pet.dewormed ? 'Yes' : 'Not stated'],
    ['Pedigree', pet.pedigree === 'pedigree' ? 'Yes' : pet.pedigree === 'non-pedigree' ? 'No' : null],
    ['Seller', pet.breeder],
    ['Posted', timeAgo(pet.created_at)],
  ];

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen
        options={{
          title: pet.breed,
          headerRight: () => (
            <Ionicons
              name="share-outline"
              size={24}
              color={t.brand}
              accessibilityLabel="Share"
              onPress={() => Share.share({ message: `${pet.breed} on PuppyPlace: ${url}`, url })}
            />
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        {photos.length ? (
          <View>
            <FlatList
              data={photos}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(u) => u}
              onMomentumScrollEnd={(e) => setPhoto(Math.round(e.nativeEvent.contentOffset.x / W))}
              renderItem={({ item }) => (
                <Image source={sized(item, 1200)} style={{ width: W, height: W, backgroundColor: t.surface }} contentFit="cover" transition={150} />
              )}
            />
            {photos.length > 1 ? (
              <View style={styles.dots}>
                {photos.map((u, i) => (
                  <View key={u} style={[styles.dot, { backgroundColor: i === photo ? t.brand : 'rgba(255,255,255,0.7)' }]} />
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <View style={[styles.noPhoto, { backgroundColor: t.surface }]}>
            <Text style={{ fontSize: 80 }}>{TYPE_EMOJI[pet.type] || '🐾'}</Text>
          </View>
        )}

        <View style={styles.body}>
          {sold ? (
            <View style={[styles.soldBanner, { backgroundColor: t.surface }]}>
              <Text style={{ color: t.text, fontWeight: '900' }}>This pet has been {soldWord(pet).toLowerCase()}.</Text>
            </View>
          ) : null}
          <Text style={[styles.breed, { color: t.text }]}>
            {pet.breed}
            {pet.name ? ` · ${pet.name}` : ''}
          </Text>
          <Text style={[styles.price, { color: pet.listing_type === 'adoption' ? t.success : t.brand }]}>{priceLabel(pet)}</Text>

          <View style={[styles.facts, { borderColor: t.border }]}>
            {facts
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <View key={k} style={[styles.fact, { borderColor: t.border }]}>
                  <Text style={[styles.factK, { color: t.textSecondary }]}>{k}</Text>
                  <Text style={[styles.factV, { color: t.text }]}>{v}</Text>
                </View>
              ))}
          </View>

          {pet.specs ? (
            <>
              <Text style={[styles.h, { color: t.text }]}>About this pet</Text>
              <Text style={[styles.p, { color: t.text }]}>{pet.specs}</Text>
            </>
          ) : null}

          <View style={[styles.safety, { backgroundColor: t.brandSoft }]}>
            <Ionicons name="shield-checkmark-outline" size={20} color={t.brand} />
            <Text style={[styles.safetyText, { color: t.text }]}>
              Meet the seller and see the pet before you pay. Never send a deposit to someone you haven't met.
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.bar, { backgroundColor: t.background, borderColor: t.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
        {mine ? (
          <>
            <Text style={[styles.mine, { color: t.textSecondary }]}>This is your listing</Text>
            <Button
              title={sold ? 'Mark as available again' : `Mark as ${soldWord(pet).toLowerCase()}`}
              kind={sold ? 'outline' : 'primary'}
              busy={busy === 'sold'}
              onPress={() =>
                sold
                  ? markSold(false)
                  : Alert.alert(`Mark as ${soldWord(pet).toLowerCase()}?`, 'Buyers will no longer be able to contact you about it.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Yes', onPress: () => markSold(true) },
                    ])
              }
            />
          </>
        ) : sold ? null : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {pet.contact ? (
              <Button title="WhatsApp" icon="logo-whatsapp" kind="whatsapp" onPress={whatsapp} busy={busy === 'wa'} style={{ flex: 1 }} />
            ) : null}
            <Button title="Message" icon="chatbubble-outline" kind={pet.contact ? 'outline' : 'primary'} onPress={message} style={{ flex: 1 }} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dots: { position: 'absolute', bottom: 12, alignSelf: 'center', flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  noPhoto: { width: W, height: W * 0.7, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16 },
  soldBanner: { padding: 12, borderRadius: 10, marginBottom: 12 },
  breed: { fontSize: 24, fontWeight: '900' },
  price: { fontSize: 22, fontWeight: '900', marginTop: 4 },
  facts: { marginTop: 16, borderTopWidth: 1 },
  fact: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, gap: 12 },
  factK: { fontSize: 14, fontWeight: '700' },
  factV: { fontSize: 14, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  h: { fontSize: 17, fontWeight: '900', marginTop: 20, marginBottom: 6 },
  p: { fontSize: 15, lineHeight: 23 },
  safety: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 12, marginTop: 20, alignItems: 'flex-start' },
  safetyText: { flex: 1, fontSize: 13, lineHeight: 19 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, gap: 8 },
  mine: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
});
