// A listing card exactly as pet-cards.js draws it on puppyplace.ng/pets.html
// (phone sizes: the page's max-width:760px rules), in grid or list view.
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ArrowIco, CalIco, HeartIco, PinIco, ShieldOkIco } from '@/components/site-icons';
import { photosOf, sized, type Pet } from '@/lib/api';
import { C, F, fmtNaira, genderOf, shadow, TYPE_BG, TYPE_EMOJI } from '@/lib/site';

type Props = { pet: Pet; saved: boolean; onHeart: (id: Pet['id']) => void; list: boolean };

export const SiteCard = memo(function SiteCard({ pet: p, saved, onHeart, list }: Props) {
  const isAdopt = p.listing_type === 'adoption';
  const sold = Boolean(p.sold_at);
  const soldLabel = isAdopt ? 'Adopted' : 'Sold';
  const img = photosOf(p)[0];
  const g = genderOf(p);
  const gSym = ({ Male: '♂', Female: '♀', Pair: '⚤' } as Record<string, string>)[g];
  const health = p.vaccinated ? 'Vaccinated' : p.dewormed ? 'Dewormed' : '';
  const open = () => router.push({ pathname: '/pet/[slug]', params: { slug: p.slug } });
  const grad = TYPE_BG[p.type] || ['#fafafa', '#f0f0f0'];

  return (
    <View style={[s.card, list && s.cardList]}>
      <Pressable onPress={open} style={[s.img, list && s.imgList, { backgroundColor: img ? '#f1f2f4' : undefined }]} accessible={false}>
        {img ? null : <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
        <View style={[StyleSheet.absoluteFill, s.center, sold && s.soldImg]}>
          {img ? (
            <Image source={sized(img, 600)} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
          ) : (
            <Text style={s.emoji}>{TYPE_EMOJI[p.type] || '🐾'}</Text>
          )}
        </View>
        <View style={[s.badge, isAdopt && { backgroundColor: C.green }, sold && { backgroundColor: C.soldGray }]}>
          <Text style={s.badgeText}>{sold ? soldLabel : isAdopt ? 'Adoption' : 'For Sale'}</Text>
        </View>
        {sold ? (
          <View style={[StyleSheet.absoluteFill, s.center]} pointerEvents="none">
            <Text style={s.stamp}>{soldLabel.toUpperCase()}</Text>
          </View>
        ) : null}
      </Pressable>

      <Pressable
        onPress={() => onHeart(p.id)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={saved ? 'Remove from saved' : 'Save pet'}
        accessibilityState={{ selected: saved }}
        style={[s.heart, list && s.heartList]}>
        <HeartIco size={16} sw={2.2} color={saved ? C.orange : C.text} fill={saved ? C.orange : 'none'} />
      </Pressable>

      <View style={[s.body, list && s.bodyList, sold && { opacity: 0.6 }]}>
        <Text onPress={open} numberOfLines={1} style={[s.name, list && { fontSize: 15 }]}>
          {p.breed || p.type}
        </Text>
        <View style={s.meta}>
          {p.breeder || p.name ? (
            <View style={s.metaItem}>
              <Text style={s.hm}>🏠</Text>
              <Text numberOfLines={1} style={[s.metaText, list && { fontSize: 10.5 }]}>
                {p.breeder || p.name}
              </Text>
            </View>
          ) : null}
          {p.location ? (
            <View style={s.metaItem}>
              <PinIco color={C.meta} />
              <Text numberOfLines={1} style={[s.metaText, list && { fontSize: 10.5 }]}>
                {p.location}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={[s.specs, list && { flexWrap: 'nowrap' }]}>
          {p.age ? (
            <View style={s.specItem}>
              <CalIco color={C.spec} />
              <Text style={[s.specText, list && { fontSize: 10.5 }]}>{p.age}</Text>
            </View>
          ) : null}
          {g ? (
            <View style={s.specItem}>
              <Text style={s.gs}>{gSym}</Text>
              <Text style={[s.specText, list && { fontSize: 10.5 }]}>{g}</Text>
            </View>
          ) : null}
          {health ? (
            <View style={s.specItem}>
              <ShieldOkIco color={C.green} />
              <Text style={[s.specText, { color: C.green }, list && { fontSize: 10.5 }]}>{health}</Text>
            </View>
          ) : null}
        </View>
        <View style={[s.foot, list && s.footList]}>
          {isAdopt ? (
            <Text numberOfLines={1} style={[s.price, { color: C.green }]}>Free</Text>
          ) : p.price ? (
            <Text numberOfLines={1} style={s.price}>{fmtNaira(p.price)}</Text>
          ) : (
            <Text numberOfLines={1} style={s.ask}>Price on request</Text>
          )}
          <Pressable onPress={open} style={[s.view, list && { paddingHorizontal: 12 }]}>
            <Text style={s.viewText}>View Details</Text>
            <ArrowIco color={C.orange} />
          </Pressable>
        </View>
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  card: { flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 14, overflow: 'hidden', ...shadow },
  cardList: { flexDirection: 'row' },
  img: { aspectRatio: 1.45, overflow: 'hidden' },
  imgList: { width: 132, aspectRatio: undefined, alignSelf: 'stretch' },
  center: { alignItems: 'center', justifyContent: 'center' },
  soldImg: { opacity: 0.55, filter: 'grayscale(1)' } as object,
  emoji: { fontSize: 48 },
  badge: { position: 'absolute', top: 12, left: 12, backgroundColor: C.orange, borderRadius: 50, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: C.white, fontSize: 10, fontFamily: F[700], textTransform: 'uppercase', letterSpacing: 0.2 },
  stamp: {
    transform: [{ rotate: '-14deg' }],
    borderWidth: 3,
    borderColor: C.stamp,
    color: C.stamp,
    backgroundColor: 'rgba(255,255,255,0.88)',
    fontSize: 24,
    fontFamily: F[800],
    fontWeight: '900',
    letterSpacing: 3.4,
    paddingHorizontal: 14,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
  },
  heart: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  heartList: { right: undefined, left: 96, width: 26, height: 26, borderRadius: 13 },
  body: { paddingTop: 11, paddingHorizontal: 10, paddingBottom: 11, flex: 1 },
  bodyList: { padding: 12, justifyContent: 'center' },
  name: { fontSize: 14, fontFamily: F[700], color: C.text, marginBottom: 7 },
  meta: { flexDirection: 'row', columnGap: 10, rowGap: 4, overflow: 'hidden', marginBottom: 9, minHeight: 14 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1, minWidth: 0 },
  metaText: { fontSize: 10, color: C.meta, fontFamily: F[400], flexShrink: 1 },
  hm: { fontSize: 12, lineHeight: 14 },
  specs: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 5, marginBottom: 11 },
  specItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  specText: { fontSize: 10, color: C.spec, fontFamily: F[400] },
  gs: { fontSize: 13, lineHeight: 15, color: C.text },
  foot: { marginTop: 'auto', gap: 8 },
  footList: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  price: { fontSize: 15, fontFamily: F[800], color: C.text },
  ask: { fontSize: 13, fontFamily: F[700], color: C.gray },
  view: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(237,100,54,0.45)',
    borderRadius: 50,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  viewText: { fontSize: 10.5, fontFamily: F[600], color: C.orange },
});
