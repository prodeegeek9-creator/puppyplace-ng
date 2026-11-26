import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Chip, Empty } from '@/components/ui';
import { PetCard } from '@/components/pet-card';
import { useTheme } from '@/constants/theme';
import { usePets } from '@/lib/pets';

const KINDS = [
  { key: 'all', label: 'All pets' },
  { key: 'Dog', label: '🐕 Dogs' },
  { key: 'Cat', label: '🐈 Cats' },
  { key: 'Bird', label: '🦜 Birds' },
  { key: 'Rabbit', label: '🐰 Rabbits' },
  { key: 'Fish', label: '🐠 Fish' },
  { key: 'other', label: '🐾 Other' },
];
const MAIN = ['Dog', 'Cat', 'Bird', 'Rabbit', 'Fish'];

type Mode = 'all' | 'sale' | 'adoption';

export default function Browse() {
  const t = useTheme();
  const { pets, error, refreshing, refresh } = usePets();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('all');
  const [mode, setMode] = useState<Mode>('all');

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (pets || []).filter((p) => {
      if (kind === 'other' ? MAIN.includes(p.type) : kind !== 'all' && p.type !== kind) return false;
      if (mode !== 'all' && p.listing_type !== mode) return false;
      if (!words.length) return true;
      const hay = `${p.breed} ${p.name || ''} ${p.type} ${p.location || ''} ${p.age || ''}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [pets, q, kind, mode]);

  const header = (
    <View style={{ paddingBottom: 6 }}>
      <View style={[styles.search, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Ionicons name="search" size={18} color={t.textSecondary} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search breed or city, e.g. Boerboel Lagos"
          placeholderTextColor={t.textSecondary}
          style={[styles.searchInput, { color: t.text }]}
          returnKeyType="search"
          clearButtonMode="while-editing"
          autoCorrect={false}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {KINDS.map((k) => (
          <Chip key={k.key} label={k.label} active={kind === k.key} onPress={() => setKind(k.key)} />
        ))}
      </ScrollView>
      <View style={[styles.chips, { paddingTop: 0 }]}>
        <Chip label="All" active={mode === 'all'} onPress={() => setMode('all')} />
        <Chip label="For sale" active={mode === 'sale'} onPress={() => setMode('sale')} />
        <Chip label="For adoption" active={mode === 'adoption'} onPress={() => setMode('adoption')} />
      </View>
      {pets ? (
        <Text style={[styles.count, { color: t.textSecondary }]}>
          {shown.length} {shown.length === 1 ? 'pet' : 'pets'}
        </Text>
      ) : null}
    </View>
  );

  if (!pets && !error) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={t.brand} size="large" />
      </View>
    );
  }

  return (
    <FlatList
      data={shown}
      keyExtractor={(p) => String(p.id)}
      numColumns={2}
      renderItem={({ item }) => <PetCard pet={item} />}
      ListHeaderComponent={header}
      contentContainerStyle={{ padding: 6, paddingBottom: 24 }}
      keyboardDismissMode="on-drag"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.brand} />}
      ListEmptyComponent={
        error ? (
          <Empty icon="cloud-offline-outline" title="Couldn't load pets" text={error}>
            <Button title="Try again" onPress={refresh} style={{ marginTop: 8 }} />
          </Empty>
        ) : (
          <Empty icon="paw-outline" title="No pets match" text="Try another search or filter." />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 6,
    marginTop: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 11 },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 6, paddingVertical: 10 },
  count: { marginHorizontal: 8, fontSize: 13, fontWeight: '700' },
});
