// The home screen: puppyplace.ng/pets.html as it looks on a phone (the page's
// max-width:760px rules in templates/pets.html), drawn natively. Same nav, hero,
// pills, filters, sort, grid/list cards, buying and selling text, questions and
// footer. The words below the listings come from the site (/api/pets-page).
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { setStatusBarStyle } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FilterSheet } from '@/components/filter-sheet';
import { SiteCard } from '@/components/site-card';
import {
  ChatIco,
  ChevIco,
  FunnelIco,
  GridIco,
  HeadsetIco,
  HeartIco,
  ListIco,
  OthersIco,
  SearchIco,
  ShieldPlusIco,
  TruckIco,
  UserIco,
} from '@/components/site-icons';
import { SitePicker } from '@/components/site-select';
import { api, SITE, type Pet } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePets } from '@/lib/pets';
import { C, DEFAULT_HERO, F, matches, NO_FILTERS, PILLS, shadow, SORT_OPTIONS, sortPets, type Filters, type PageText } from '@/lib/site';

const SAVED_KEY = 'pp_pet_wish';
const openSite = (path: string) => WebBrowser.openBrowserAsync(path.startsWith('http') ? path : `${SITE}${path}`);
const KIND_PATHS: Record<string, string> = {
  '/dogs-for-sale.html': 'Dog',
  '/cats-for-sale.html': 'Cat',
  '/birds-for-sale.html': 'Bird',
  '/rabbits-for-sale.html': 'Rabbit',
  '/fish-for-sale.html': 'Fish',
  '/other-pets-for-sale.html': 'other',
};

export default function PetsHome() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { account } = useAuth();
  const { pets, error, refreshing, refresh } = usePets();
  const [text, setText] = useState<PageText | null>(null);
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [input, setInput] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [saved, setSaved] = useState<Pet['id'][]>([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [faqOpen, setFaqOpen] = useState<Set<number>>(new Set());
  const list = useRef<FlatList<Pet>>(null);
  const search = useRef<React.ComponentRef<typeof TextInput>>(null);
  const toolbarY = useRef(0);

  // The dark nav needs light status bar text, on this tab only.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('auto');
    }, []),
  );

  useEffect(() => {
    api<PageText>('/api/pets-page').then(setText, () => {});
    SecureStore.getItemAsync(SAVED_KEY)
      .then((v) => v && setSaved(JSON.parse(v)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!account) return setUnread(0);
    api<{ count: number }>('/api/dm/unread').then((r) => setUnread(r.count || 0), () => {});
  }, [account]);

  const all = useMemo(() => pets || [], [pets]);
  const shown = useMemo(
    () => (savedOnly ? all.filter((p) => saved.includes(p.id)) : sortPets(all.filter((p) => matches(p, f)), f.sort)),
    [all, f, saved, savedOnly],
  );
  const savedCount = saved.filter((id) => all.some((p) => p.id === id)).length;
  const locations = useMemo(() => {
    const seen = new Map<string, string>();
    all.forEach((p) => {
      const l = String(p.location || '').trim();
      if (l && !seen.has(l.toLowerCase())) seen.set(l.toLowerCase(), l);
    });
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [all]);
  const pillOn = f.types.length === 1 ? f.types[0] : f.types.length ? null : 'all';

  const heart = useCallback((id: Pet['id']) => {
    setSaved((cur) => {
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      SecureStore.setItemAsync(SAVED_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const toToolbar = () => list.current?.scrollToOffset({ offset: Math.max(0, toolbarY.current), animated: true });
  const applySearch = () => {
    setF((x) => ({ ...x, q: input.trim() }));
    if (input.trim()) toToolbar();
  };
  const reset = () => {
    setF({ ...NO_FILTERS, sort: f.sort });
    setInput('');
    setSavedOnly(false);
  };

  // Phone sizes from the page's media queries
  const small = width <= 380;
  const navPad = width <= 420 ? 12 : 16;
  const navGap = width <= 420 ? 8 : width <= 480 ? 10 : 14;
  const showCta = width > 388;

  const nav = (
    <View style={[s.nav, { paddingTop: insets.top, height: 60 + insets.top, paddingHorizontal: navPad }]}>
      <Pressable onPress={() => list.current?.scrollToOffset({ offset: 0, animated: true })} style={s.logo}>
        <Text numberOfLines={1} style={s.logoText}>🐾 Puppy</Text>
        <Text numberOfLines={1} style={[s.logoText, { color: C.orange }]}>Place</Text>
      </Pressable>
      <View style={[s.navRight, { gap: navGap }]}>
        <Pressable
          style={s.navIco}
          accessibilityLabel="Search pets"
          onPress={() => {
            list.current?.scrollToOffset({ offset: 0, animated: true });
            search.current?.focus();
          }}>
          <SearchIco />
        </Pressable>
        <Pressable
          style={s.navIco}
          accessibilityLabel="Saved pets"
          onPress={() => {
            setSavedOnly((v) => !v);
            setTimeout(toToolbar, 50);
          }}>
          <HeartIco color={savedOnly ? C.orange : C.white} />
          {savedCount > 0 ? (
            <View style={s.cnt}>
              <Text style={s.cntText}>{savedCount}</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable style={s.navIco} accessibilityLabel="Messages" onPress={() => router.navigate('/messages')}>
          <ChatIco />
          {unread > 0 ? (
            <View style={s.cnt}>
              <Text style={s.cntText}>{unread}</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable style={s.navIco} accessibilityLabel={account ? 'Account' : 'Sign in'} onPress={() => router.navigate('/account')}>
          <UserIco />
        </Pressable>
        {showCta ? (
          <Pressable onPress={() => openSite('/contact.html')} style={({ pressed }) => [s.cta, pressed && { backgroundColor: C.orangeD }]}>
            <Text style={s.ctaText}>Contact Us</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  const hero = text || DEFAULT_HERO;
  const trust = [
    { icon: <ShieldPlusIco color={C.trustGreen} />, label: 'Verified\nBreeders' },
    { icon: <HeartIco size={26} sw={1.8} color={C.trustGreen} />, label: 'Healthy &\nVaccinated' },
    { icon: <TruckIco color={C.trustGreen} />, label: 'Safe\nDelivery' },
    { icon: <HeadsetIco color={C.orange} />, label: 'Ongoing\nSupport' },
  ];

  const header = (
    <View>
      <View style={s.hero}>
        <View style={s.heroImg} pointerEvents="none">
          <Image source={require('@/assets/images/pets-hero-puppy.jpg')} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={{ left: '38%', top: '50%' }} />
          <LinearGradient
            colors={['#151513', 'rgba(21,21,19,0.4)', 'rgba(21,21,19,0)']}
            locations={[0, 0.45, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
        <View style={s.heroInner}>
          <Text style={s.eyebrow}>Healthy pets. Happy homes.</Text>
          <Text style={[s.h1, small && { fontSize: 29, lineHeight: 31.3 }]}>
            {hero.h1.map((l, i) => (
              <Text key={i}>
                {i ? '\n' : ''}
                {l.text}
                {l.accent ? <Text style={{ color: C.orange }}>{l.accent}</Text> : null}
                {l.after}
              </Text>
            ))}
          </Text>
          <Text style={s.sub}>{hero.sub}</Text>
          <View style={s.searchBox}>
            <SearchIco size={20} sw={2.2} color={C.text} />
            <TextInput
              ref={search}
              value={input}
              onChangeText={(v) => {
                setInput(v);
                if (!v) setF((x) => ({ ...x, q: '' }));
              }}
              onSubmitEditing={applySearch}
              placeholder="Search by breed, location or pet type..."
              placeholderTextColor="#8a8d94"
              returnKeyType="search"
              autoCorrect={false}
              accessibilityLabel="Search pets"
              style={s.searchInput}
            />
            <Pressable onPress={applySearch} style={({ pressed }) => [s.searchBtn, pressed && { backgroundColor: C.orangeD }]}>
              <Text style={s.searchBtnText}>Search</Text>
            </Pressable>
          </View>
          <View style={s.trust}>
            {trust.map((t, i) => (
              <View key={t.label} style={[s.trustItem, i === 0 ? { borderLeftWidth: 0, paddingLeft: 0 } : null]}>
                {t.icon}
                <Text style={s.trustText}>{t.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={s.toolbar} onLayout={(e) => (toolbarY.current = e.nativeEvent.layout.y)}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills} style={{ overflow: 'visible' }}>
          {PILLS.map((p) => {
            const on = pillOn === p.type;
            return (
              <Pressable
                key={p.type}
                onPress={() => {
                  setSavedOnly(false);
                  setF((x) => ({ ...x, types: p.type === 'all' ? [] : [p.type] }));
                }}
                accessibilityState={{ selected: on }}
                style={[s.pill, on && s.pillOn]}>
                {p.emoji ? <Text style={s.em}>{p.emoji}</Text> : <OthersIco color={on ? C.white : C.text} />}
                <Text style={[s.pillText, on && s.pillTextOn]}>{p.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={s.tools}>
          <Pressable onPress={() => setFiltersOpen(true)} style={s.filterOpen}>
            <FunnelIco color={C.orange} />
            <Text style={s.filterText}>Filters</Text>
          </Pressable>
          <View style={s.toolsR}>
            <SitePicker title="Sort by" options={SORT_OPTIONS} value={f.sort} onChange={(v) => setF((x) => ({ ...x, sort: v as Filters['sort'] }))}>
              {(label, open) => (
                <Pressable onPress={open} style={s.sort} accessibilityLabel="Sort pets">
                  <Text numberOfLines={1} style={s.sortText}>
                    {label}
                  </Text>
                  <ChevIco color={C.text} />
                </Pressable>
              )}
            </SitePicker>
            <View style={s.viewToggle}>
              {(['grid', 'list'] as const).map((v) => (
                <Pressable key={v} onPress={() => setView(v)} accessibilityLabel={v === 'grid' ? 'Grid view' : 'List view'} accessibilityState={{ selected: view === v }} style={[s.viewBtn, view === v && { backgroundColor: C.orange }]}>
                  {v === 'grid' ? <GridIco color={view === v ? C.white : '#4a4d55'} /> : <ListIco color={view === v ? C.white : '#4a4d55'} />}
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </View>
    </View>
  );

  const empty = (
    <View style={s.emptyWrap}>
      <View style={s.empty}>
        <Text style={s.emptyIco}>🐾</Text>
        {!pets && !error ? (
          <Text style={s.emptyText}>Loading pets…</Text>
        ) : error && !pets ? (
          <Text style={s.emptyText}>We couldn’t load the pets just now. Pull down to try again.</Text>
        ) : savedOnly ? (
          <Text style={s.emptyText}>You haven’t saved any pets yet. Tap the ♡ on a pet to save it.</Text>
        ) : (
          <>
            <Text style={s.emptyText}>{all.length ? 'No pets match your filters.' : 'No pets listed in Nigeria yet. Check back soon!'}</Text>
            {all.length ? (
              <Pressable onPress={() => router.navigate('/sell')} style={s.sellPill}>
                <Text style={s.sellPillText}>🐶 Selling a dog? List it free →</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>
    </View>
  );

  const footer = (
    <View>
      {text ? (
        <View style={s.seo}>
          <View style={s.seoCard}>
            <Text style={s.h2}>{text.buy_title}</Text>
            <Text style={s.p}>{text.buy_intro}</Text>
            <Text style={[s.p, { marginTop: 10 }]}>{text.checked}</Text>
            <Text style={[s.h2, { marginTop: 22 }]}>{text.sell_title}</Text>
            <Text style={s.p}>{text.sell_text}</Text>
            <View style={s.ctas}>
              <Pressable onPress={() => router.navigate('/sell')} style={({ pressed }) => [s.seoBtn, pressed && { backgroundColor: C.orangeD }]}>
                <Text style={s.seoBtnText}>{text.sell_cta.label}</Text>
              </Pressable>
              {text.adoption_cta ? (
                <Pressable onPress={() => openSite(text.adoption_cta!.href)} style={[s.seoBtn, s.ghost]}>
                  <Text style={[s.seoBtnText, { color: C.orange }]}>{text.adoption_cta.label}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={s.seoCard}>
            {text.browse.map((b, i) => (
              <View key={b.title}>
                <Text style={[s.h2, i ? { marginTop: 22 } : null]}>{b.title}</Text>
                <View style={s.links}>
                  {b.links.map((l) => (
                    <Pressable
                      key={l.href}
                      onPress={() => {
                        const kind = KIND_PATHS[l.href];
                        if (!kind) return openSite(l.href);
                        setSavedOnly(false);
                        setF((x) => ({ ...x, types: [kind] }));
                        toToolbar();
                      }}
                      style={s.link}>
                      <Text style={s.linkText}>
                        {l.label}
                        {l.n != null ? <Text style={s.linkN}> {l.n}</Text> : null}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </View>

          <View style={s.seoCard}>
            <Text style={s.h2}>{text.faq_title}</Text>
            {text.faqs.map((q, i) => {
              const open = faqOpen.has(i);
              return (
                <View key={q.q} style={[s.faq, i === 0 && { borderTopWidth: 0 }]}>
                  <Pressable
                    onPress={() =>
                      setFaqOpen((cur) => {
                        const n = new Set(cur);
                        if (n.has(i)) n.delete(i);
                        else n.add(i);
                        return n;
                      })
                    }
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                    style={s.summary}>
                    <Text style={s.summaryText}>{q.q}</Text>
                    <Text style={s.plus}>{open ? '–' : '+'}</Text>
                  </Pressable>
                  {open ? <Text style={[s.p, { marginTop: 8 }]}>{q.a}</Text> : null}
                </View>
              );
            })}
          </View>
        </View>
      ) : (
        <View style={{ height: 40 }} />
      )}

      <View style={[s.footer, { paddingBottom: 28 }]}>
        <Text style={s.footerText}>
          <Text style={s.footerLink} onPress={() => openSite('/')}>
            PuppyPlace.ng
          </Text>
          {' · Nigeria’s Pet Marketplace\n'}
          {[
            ['Sell your dog', '/sell-my-dog.html'],
            ['List your pet', 'sell'],
            ['About', '/about.html'],
            ['Contact', '/contact.html'],
            ['FAQs', '/faq.html'],
            ['Terms', '/terms.html'],
            ['Privacy', '/privacy.html'],
          ].map(([label, path], i) => (
            <Text key={label}>
              {i ? ' · ' : ''}
              <Text style={s.footerLink} onPress={() => (path === 'sell' ? router.navigate('/sell') : openSite(path))}>
                {label}
              </Text>
            </Text>
          ))}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={s.page}>
      {nav}
      <FlatList
        ref={list}
        key={view}
        data={shown}
        numColumns={view === 'grid' ? 2 : 1}
        keyExtractor={(p) => String(p.id)}
        renderItem={({ item }) => (
          <View style={view === 'grid' ? { flex: 1, maxWidth: (width - 32 - 12) / 2 } : { paddingHorizontal: 16 }}>
            <SiteCard pet={item} saved={saved.includes(item.id)} onHeart={heart} list={view === 'list'} />
          </View>
        )}
        columnWrapperStyle={view === 'grid' ? { gap: 12, paddingHorizontal: 16 } : undefined}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.orange} />}
        initialNumToRender={8}
      />
      <FilterSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        value={f}
        locations={locations}
        onReset={reset}
        onApply={(d) => {
          setSavedOnly(false);
          setF((x) => ({ ...x, ...d }));
          setFiltersOpen(false);
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.light },

  nav: { backgroundColor: C.dark, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)', zIndex: 10 },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  logoText: { fontFamily: F.logo, color: C.white, fontSize: 18 },
  navRight: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  navIco: { padding: 4, alignItems: 'center', justifyContent: 'center' },
  cnt: { position: 'absolute', top: -4, right: -6, backgroundColor: C.orange, minWidth: 17, height: 17, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  cntText: { color: C.white, fontSize: 10, fontFamily: F[800] },
  cta: { backgroundColor: C.orange, borderRadius: 50, paddingVertical: 7, paddingHorizontal: 11 },
  ctaText: { color: C.white, fontSize: 12, fontFamily: F[600] },

  hero: { backgroundColor: C.hero, overflow: 'hidden', minHeight: 311 },
  heroImg: { position: 'absolute', top: 0, right: 0, bottom: 0, width: '62%', opacity: 0.5 },
  heroInner: { paddingTop: 26, paddingHorizontal: 16, paddingBottom: 24 },
  eyebrow: { fontSize: 11, fontFamily: F[800], letterSpacing: 0.44, textTransform: 'uppercase', color: C.orange, marginBottom: 8 },
  h1: { fontSize: 34, lineHeight: 36.7, fontFamily: F[800], color: C.white, letterSpacing: -0.68, marginBottom: 12 },
  sub: { fontSize: 13.5, lineHeight: 17.5, color: 'rgba(255,255,255,0.85)', maxWidth: 320, marginBottom: 16, fontFamily: F[400] },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.white,
    borderRadius: 50,
    height: 48,
    paddingLeft: 16,
    paddingRight: 4,
    borderWidth: 2,
    borderColor: C.white,
    shadowColor: '#fff',
    shadowOpacity: 0.25,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 0 },
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 13, color: C.text, paddingHorizontal: 12, fontFamily: F[400], paddingVertical: 0 },
  searchBtn: { backgroundColor: C.orange, borderRadius: 50, height: 40, paddingHorizontal: 20, justifyContent: 'center' },
  searchBtnText: { color: C.white, fontSize: 14, fontFamily: F[600] },
  trust: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 22 },
  trustItem: { flex: 1, alignItems: 'center', gap: 6, paddingHorizontal: 6, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.22)' },
  trustText: { color: C.white, fontSize: 10.5, lineHeight: 13.6, fontFamily: F[500], textAlign: 'center' },

  toolbar: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, gap: 16 },
  pills: { gap: 10, paddingVertical: 4 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 9, height: 34, paddingHorizontal: 14, backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 50, ...shadow },
  pillOn: { backgroundColor: C.orange, borderColor: C.orange, paddingHorizontal: 18 },
  em: { fontSize: 17, lineHeight: 20 },
  pillText: { fontSize: 13, fontFamily: F[500], color: C.text },
  pillTextOn: { color: C.white, fontFamily: F[700] },
  tools: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  filterOpen: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 36, paddingHorizontal: 14, backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 10, ...shadow },
  filterText: { fontSize: 12, fontFamily: F[600], color: C.text },
  toolsR: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  sort: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 36, paddingLeft: 14, paddingRight: 10, backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 10, flexShrink: 1, ...shadow },
  sortText: { fontSize: 12, fontFamily: F[500], color: C.text, maxWidth: 130, minWidth: 96, flexShrink: 1 },
  viewToggle: { flexDirection: 'row', backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 50, padding: 3, ...shadow },
  viewBtn: { width: 36, height: 30, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },

  emptyWrap: { paddingHorizontal: 16 },
  empty: { alignItems: 'center', paddingVertical: 80, paddingHorizontal: 20, backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 14 },
  emptyIco: { fontSize: 52, marginBottom: 14 },
  emptyText: { color: C.gray, fontSize: 15, textAlign: 'center', fontFamily: F[400] },
  sellPill: { marginTop: 16, backgroundColor: 'rgba(237,100,54,0.1)', borderWidth: 1, borderColor: 'rgba(237,100,54,0.4)', borderRadius: 50, paddingVertical: 8, paddingHorizontal: 16 },
  sellPillText: { color: C.orange, fontFamily: F[700], fontSize: 13 },

  seo: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 14 },
  seoCard: { backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingVertical: 18, paddingHorizontal: 16, ...shadow },
  h2: { fontSize: 18, fontFamily: F[800], color: C.heading, letterSpacing: -0.18, marginBottom: 10 },
  p: { fontSize: 14, lineHeight: 24.5, color: C.spec, fontFamily: F[400] },
  ctas: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  seoBtn: { height: 42, paddingHorizontal: 20, borderRadius: 50, backgroundColor: C.orange, justifyContent: 'center' },
  ghost: { backgroundColor: C.white, borderWidth: 1.5, borderColor: C.orange },
  seoBtnText: { color: C.white, fontSize: 13, fontFamily: F[700] },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  link: { backgroundColor: C.light, borderWidth: 1, borderColor: C.border, borderRadius: 50, paddingVertical: 7, paddingHorizontal: 14 },
  linkText: { fontSize: 13, fontFamily: F[600], color: C.text },
  linkN: { color: C.gray, fontFamily: F[500] },
  faq: { borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 14 },
  summary: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  summaryText: { flex: 1, fontSize: 15, fontFamily: F[700], color: C.text },
  plus: { color: C.orange, fontSize: 20, lineHeight: 20, fontFamily: F[600] },

  footer: { backgroundColor: C.dark, paddingTop: 28, paddingHorizontal: 24 },
  footerText: { color: 'rgba(255,255,255,0.4)', textAlign: 'center', fontSize: 13, lineHeight: 19, fontFamily: F[400] },
  footerLink: { color: 'rgba(255,255,255,0.6)', fontFamily: F[700] },
});
