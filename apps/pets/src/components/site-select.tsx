// The page's <select> boxes: the closed box looks like the site's; tapping it
// opens the phone's usual list to choose from.
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevIco } from '@/components/site-icons';
import { C, F } from '@/lib/site';

export type Option = { value: string; label: string };

export function SitePicker({ options, value, onChange, title, children }: {
  options: Option[];
  value: string;
  onChange: (v: string) => void;
  title: string;
  children: (label: string, open: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const label = options.find((o) => o.value === value)?.label ?? options[0]?.label ?? '';
  return (
    <>
      {children(label, () => setOpen(true))}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Text style={s.title}>{title}</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {options.map((o) => (
                <Pressable
                  key={o.value}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  style={s.opt}>
                  <Text style={[s.optText, o.value === value && { color: C.orange, fontFamily: F[700] }]}>{o.label}</Text>
                  {o.value === value ? <Text style={{ color: C.orange, fontSize: 16 }}>✓</Text> : null}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// .sel select: 36px tall, 8px corners, 12px text, chevron on the right
export function SiteSelect({ options, value, onChange, title, icon, style }: {
  options: Option[];
  value: string;
  onChange: (v: string) => void;
  title: string;
  icon?: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <SitePicker options={options} value={value} onChange={onChange} title={title}>
      {(label, open) => (
        <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={title} style={[s.sel, icon ? { paddingLeft: 32 } : null, style]}>
          {icon ? <View style={s.ico}>{icon}</View> : null}
          <Text numberOfLines={1} style={s.selText}>
            {label}
          </Text>
          <View style={s.chev}>
            <ChevIco color={C.spec} />
          </View>
        </Pressable>
      )}
    </SitePicker>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.white, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 16 },
  title: { fontFamily: F[700], fontSize: 14, color: C.text, paddingHorizontal: 20, paddingBottom: 8 },
  opt: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: C.border },
  optText: { fontFamily: F[500], fontSize: 15, color: C.text },
  sel: { height: 36, borderWidth: 1, borderColor: C.border, borderRadius: 8, backgroundColor: C.white, paddingLeft: 10, paddingRight: 30, justifyContent: 'center' },
  selText: { fontSize: 12, color: C.spec, fontFamily: F[400] },
  ico: { position: 'absolute', left: 10 },
  chev: { position: 'absolute', right: 10 },
});
