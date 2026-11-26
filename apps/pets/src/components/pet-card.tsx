import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/constants/theme';
import { photosOf, priceLabel, sized, soldWord, TYPE_EMOJI, type Pet } from '@/lib/api';

export const PetCard = memo(function PetCard({ pet }: { pet: Pet }) {
  const t = useTheme();
  const photo = photosOf(pet)[0];
  const sold = Boolean(pet.sold_at);
  const adopt = pet.listing_type === 'adoption';
  return (
      <Pressable
        onPress={() => router.push({ pathname: '/pet/[slug]', params: { slug: pet.slug } })}
        style={[styles.card, { backgroundColor: t.background, borderColor: t.border }, sold && { opacity: 0.6 }]}>
        <View style={[styles.photo, { backgroundColor: t.surface }]}>
          {photo ? (
            <Image source={sized(photo, 600)} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
          ) : (
            <Text style={{ fontSize: 44 }}>{TYPE_EMOJI[pet.type] || '🐾'}</Text>
          )}
          {sold ? (
            <View style={[styles.badge, { backgroundColor: t.text }]}>
              <Text style={styles.badgeText}>{soldWord(pet).toUpperCase()}</Text>
            </View>
          ) : adopt ? (
            <View style={[styles.badge, { backgroundColor: t.success }]}>
              <Text style={styles.badgeText}>ADOPT</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.body}>
          <Text numberOfLines={1} style={[styles.breed, { color: t.text }]}>
            {pet.breed || pet.type}
          </Text>
          <Text numberOfLines={1} style={[styles.price, { color: adopt ? t.success : t.brand }]}>
            {priceLabel(pet)}
          </Text>
          {pet.location ? (
            <View style={styles.row}>
              <Ionicons name="location-outline" size={12} color={t.textSecondary} />
              <Text numberOfLines={1} style={[styles.meta, { color: t.textSecondary }]}>
                {pet.location}
              </Text>
            </View>
          ) : null}
          {pet.age ? (
            <Text numberOfLines={1} style={[styles.meta, { color: t.textSecondary }]}>
              {pet.age}
              {pet.vaccinated ? ' · Vaccinated' : ''}
            </Text>
          ) : null}
        </View>
      </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { flex: 1, borderRadius: 14, borderWidth: 1, overflow: 'hidden', margin: 6 },
  photo: { aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 8, left: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  body: { padding: 10, gap: 2 },
  breed: { fontSize: 15, fontWeight: '800' },
  price: { fontSize: 15, fontWeight: '900' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  meta: { fontSize: 12, flexShrink: 1 },
});
