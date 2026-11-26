// "Filter Pets": the page's sidebar, which on a phone slides in from the left.
import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloseIco, FunnelIco, PinIco } from '@/components/site-icons';
import { SiteSelect } from '@/components/site-select';
import { AGE_OPTIONS, C, F, MAX_OPTIONS, MIN_OPTIONS, shadow, VAC_OPTIONS, type Filters } from '@/lib/site';

const TYPES = [
  { value: 'Dog', label: 'Dogs' },
  { value: 'Cat', label: 'Cats' },
  { value: 'Bird', label: 'Birds' },
  { value: 'Rabbit', label: 'Rabbits' },
  { value: 'Fish', label: 'Fish' },
  { value: 'other', label: 'Others' },
];

type Draft = Pick<Filters, 'types' | 'age' | 'gender' | 'loc' | 'vac' | 'min' | 'max'>;

export function FilterSheet({ open, onClose, value, locations, onApply, onReset }: {
  open: boolean;
  onClose: () => void;
  value: Draft;
  locations: string[];
  onApply: (d: Draft) => void;
  onReset: () => void;
}) {
  const insets = useSafeAreaInsets();
  const width = Math.min(300, Dimensions.get('window').width * 0.86);
  const x = useRef(new Animated.Value(-width)).current;
  const [draft, setDraft] = useState<Draft>(value);
  const [shown, setShown] = useState(open);

  useEffect(() => {
    if (open) {
      setDraft(value);
      setShown(true);
      Animated.timing(x, { toValue: 0, duration: 300, useNativeDriver: true }).start();
    } else if (shown) {
      Animated.timing(x, { toValue: -width * 1.05, duration: 300, useNativeDriver: true }).start(() => setShown(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const toggleType = (t: string) => set('types', draft.types.includes(t) ? draft.types.filter((x) => x !== t) : [...draft.types, t]);

  return (
    <Modal visible={shown} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, s.backdrop, { opacity: x.interpolate({ inputRange: [-width, 0], outputRange: [0, 1], extrapolate: 'clamp' }) }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close filters" />
      </Animated.View>
      <Animated.View style={[s.sidebar, { width, paddingTop: insets.top + 20, transform: [{ translateX: x }] }]}>
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 22 }} showsVerticalScrollIndicator={false}>
          <View style={s.head}>
            <View style={s.title}>
              <FunnelIco size={16} color={C.orange} />
              <Text style={s.titleText}>Filter Pets</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Pressable
                onPress={() => {
                  onReset();
                  onClose();
                }}>
                <Text style={s.reset}>Reset</Text>
              </Pressable>
              <Pressable onPress={onClose} accessibilityLabel="Close filters" hitSlop={8}>
                <CloseIco color={C.text} />
              </Pressable>
            </View>
          </View>

          <View style={s.group}>
            <Text style={s.label}>Pet Type</Text>
            {TYPES.map((t) => {
              const on = draft.types.includes(t.value);
              return (
                <Pressable key={t.value} onPress={() => toggleType(t.value)} style={s.chk} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                  <View style={[s.box, on && s.boxOn]}>{on ? <View style={s.tick} /> : null}</View>
                  <Text style={s.opt}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={s.group}>
            <Text style={s.label}>Age</Text>
            <SiteSelect title="Age" options={AGE_OPTIONS} value={draft.age} onChange={(v) => set('age', v)} />
          </View>

          <View style={s.group}>
            <Text style={s.label}>Gender</Text>
            <View style={s.radios}>
              {[
                ['Male', 'Male'],
                ['Female', 'Female'],
                ['', 'Any'],
              ].map(([v, l]) => {
                const on = draft.gender === v;
                return (
                  <Pressable key={l} onPress={() => set('gender', v)} style={s.rad} accessibilityRole="radio" accessibilityState={{ checked: on }}>
                    <View style={[s.circle, on && s.circleOn]}>{on ? <View style={s.dot} /> : null}</View>
                    <Text style={s.opt}>{l}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={s.group}>
            <Text style={s.label}>Location</Text>
            <SiteSelect
              title="Location"
              icon={<PinIco size={14} sw={2} color={C.spec} />}
              options={[{ value: '', label: 'Any location' }, ...locations.map((l) => ({ value: l, label: l }))]}
              value={draft.loc}
              onChange={(v) => set('loc', v)}
            />
          </View>

          <View style={s.group}>
            <Text style={s.label}>Vaccinated</Text>
            <SiteSelect title="Vaccinated" options={VAC_OPTIONS} value={draft.vac} onChange={(v) => set('vac', v)} />
          </View>

          <View style={s.group}>
            <Text style={s.label}>Price Range</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <SiteSelect title="Minimum price" options={MIN_OPTIONS} value={draft.min} onChange={(v) => set('min', v)} style={{ flex: 1 }} />
              <SiteSelect title="Maximum price" options={MAX_OPTIONS} value={draft.max} onChange={(v) => set('max', v)} style={{ flex: 1 }} />
            </View>
          </View>

          <Pressable onPress={() => onApply(draft)} style={({ pressed }) => [s.apply, pressed && { backgroundColor: C.orangeD }]}>
            <FunnelIco color={C.white} />
            <Text style={s.applyText}>Apply Filters</Text>
          </Pressable>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.45)' },
  sidebar: { position: 'absolute', top: 0, left: 0, bottom: 0, backgroundColor: C.white, paddingHorizontal: 18, ...shadow },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  title: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleText: { fontSize: 14, fontFamily: F[700], color: C.text },
  reset: { color: C.orange, fontSize: 12, fontFamily: F[600] },
  group: { marginBottom: 22 },
  label: { fontSize: 12, fontFamily: F[700], color: C.text, marginBottom: 10 },
  chk: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 },
  box: { width: 16, height: 16, borderWidth: 1.5, borderColor: C.check, borderRadius: 4, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: C.orange, borderColor: C.orange },
  tick: { width: 4, height: 8, borderColor: C.white, borderRightWidth: 2, borderBottomWidth: 2, transform: [{ rotate: '45deg' }, { translateY: -1 }] },
  opt: { fontSize: 12, color: C.spec, fontFamily: F[400] },
  radios: { flexDirection: 'row', gap: 18 },
  rad: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  circle: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: C.check, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  circleOn: { borderColor: C.orange, backgroundColor: C.orange },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.white },
  apply: { height: 42, borderRadius: 10, backgroundColor: C.orange, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  applyText: { color: C.white, fontSize: 13, fontFamily: F[600] },
});
