import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Chip, Empty, Field, Toggle } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { api, errorText, PET_TYPES } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const MAX_PHOTOS = 6;
type Photo = { uri: string; data: string };

const blank = {
  breed: '',
  type: 'Dog',
  listing_type: 'sale' as 'sale' | 'adoption',
  price: '',
  age: '',
  location: '',
  name: '',
  description: '',
  vaccinated: false,
  dewormed: false,
  pedigree: null as 'pedigree' | 'non-pedigree' | null,
};

// A new listing (POST /api/me/listing). Like the ones from the WhatsApp
// assistant, it is reviewed by PuppyPlace before it shows to buyers.
export default function Sell() {
  const t = useTheme();
  const { account, refresh } = useAuth();
  const [f, setF] = useState(blank);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setF((x) => ({ ...x, [k]: v }));

  if (!account) {
    return (
      <Empty icon="add-circle-outline" title="List your pet on PuppyPlace" text="Sign in with your WhatsApp number to sell or rehome a pet. Buyers contact you on WhatsApp or here in the app.">
        <Button title="Sign in" onPress={() => router.push({ pathname: '/sign-in', params: { why: 'Sign in to list a pet.' } })} style={{ marginTop: 8 }} />
      </Empty>
    );
  }

  async function addPhotos(camera: boolean) {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', camera ? 'Allow camera access to take a photo.' : 'Allow photo access to choose photos.');
      return;
    }
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 0.7,
      base64: true,
      allowsMultipleSelection: !camera,
      selectionLimit: MAX_PHOTOS - photos.length,
    };
    const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (r.canceled) return;
    const picked = r.assets
      .filter((a) => a.base64)
      .map((a) => ({ uri: a.uri, data: `data:${a.mimeType && /^image\/(jpeg|png|webp)$/.test(a.mimeType) ? a.mimeType : 'image/jpeg'};base64,${a.base64}` }));
    setPhotos((p) => [...p, ...picked].slice(0, MAX_PHOTOS));
  }

  async function submit() {
    if (!f.breed.trim()) return Alert.alert('Breed needed', 'Enter the breed, e.g. Boerboel or Persian cat.');
    if (!photos.length) return Alert.alert('Photo needed', 'Add at least one clear photo of the pet.');
    setBusy(true);
    try {
      await api('/api/me/listing', {
        breed: f.breed,
        type: f.type,
        listing_type: f.listing_type,
        price: f.listing_type === 'sale' ? f.price.replace(/[^\d]/g, '') || null : null,
        age: f.age,
        location: f.location,
        name: f.name,
        description: f.description,
        vaccinated: f.vaccinated,
        dewormed: f.dewormed,
        pedigree: f.pedigree,
        photos: photos.map((p) => p.data),
      });
      setF(blank);
      setPhotos([]);
      refresh();
      Alert.alert('Sent for review ✅', 'PuppyPlace checks every listing. You will get a WhatsApp message when it is live.', [
        { text: 'See my listings', onPress: () => router.navigate('/account') },
        { text: 'OK' },
      ]);
    } catch (e) {
      Alert.alert('Not sent', errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: t.text }]}>Photos ({photos.length}/{MAX_PHOTOS})</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {photos.map((p, i) => (
            <View key={p.uri}>
              <Image source={p.uri} style={[styles.thumb, { backgroundColor: t.surface }]} contentFit="cover" />
              <Pressable accessibilityLabel="Remove photo" onPress={() => setPhotos((x) => x.filter((_, j) => j !== i))} style={styles.remove}>
                <Ionicons name="close-circle" size={24} color="#fff" />
              </Pressable>
            </View>
          ))}
          {photos.length < MAX_PHOTOS ? (
            <>
              <Pressable onPress={() => addPhotos(false)} style={[styles.thumb, styles.add, { borderColor: t.border }]}>
                <Ionicons name="images-outline" size={26} color={t.brand} />
                <Text style={{ color: t.brand, fontWeight: '800', fontSize: 12 }}>Gallery</Text>
              </Pressable>
              <Pressable onPress={() => addPhotos(true)} style={[styles.thumb, styles.add, { borderColor: t.border }]}>
                <Ionicons name="camera-outline" size={26} color={t.brand} />
                <Text style={{ color: t.brand, fontWeight: '800', fontSize: 12 }}>Camera</Text>
              </Pressable>
            </>
          ) : null}
        </ScrollView>

        <Text style={[styles.label, { color: t.text, marginTop: 18 }]}>Type of pet</Text>
        <View style={styles.chips}>
          {PET_TYPES.map((x) => (
            <Chip key={x} label={x} active={f.type === x} onPress={() => set('type', x)} />
          ))}
        </View>

        <Field label="Breed" value={f.breed} onChangeText={(v) => set('breed', v)} placeholder="e.g. Boerboel" maxLength={80} />

        <Text style={[styles.label, { color: t.text, marginTop: 14 }]}>Listing</Text>
        <View style={styles.chips}>
          <Chip label="For sale" active={f.listing_type === 'sale'} onPress={() => set('listing_type', 'sale')} />
          <Chip label="For adoption (free)" active={f.listing_type === 'adoption'} onPress={() => set('listing_type', 'adoption')} />
        </View>
        {f.listing_type === 'sale' ? (
          <Field label="Price (₦)" value={f.price} onChangeText={(v) => set('price', v)} placeholder="150000" keyboardType="number-pad" hint="Leave empty for “price on request”." />
        ) : null}
        <Field label="Age" value={f.age} onChangeText={(v) => set('age', v)} placeholder="e.g. 10 weeks" maxLength={40} />
        <Field label="Location" value={f.location} onChangeText={(v) => set('location', v)} placeholder="e.g. Lekki, Lagos" maxLength={80} />
        <Field label="Pet's name (optional)" value={f.name} onChangeText={(v) => set('name', v)} maxLength={60} />
        <Field
          label="Description"
          value={f.description}
          onChangeText={(v) => set('description', v)}
          placeholder="How many males and females, colour, parents, temperament…"
          multiline
          maxLength={1500}
        />

        <View style={{ marginTop: 12 }}>
          <Toggle label="Vaccinated" value={f.vaccinated} onChange={(v) => set('vaccinated', v)} />
          <Toggle label="Dewormed" value={f.dewormed} onChange={(v) => set('dewormed', v)} />
          <Toggle label="Pedigree papers" value={f.pedigree === 'pedigree'} onChange={(v) => set('pedigree', v ? 'pedigree' : null)} />
        </View>

        <Text style={[styles.note, { color: t.textSecondary }]}>
          Buyers reach you on WhatsApp at {account.phone.replace(/^234/, '0')} and by message here. Your listing shows once PuppyPlace has approved it.
        </Text>
        <Button title="Send for review" icon="paper-plane-outline" onPress={submit} busy={busy} style={{ marginTop: 14 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 48 },
  label: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 96, height: 96, borderRadius: 12 },
  add: { borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4 },
  remove: { position: 'absolute', top: 2, right: 2, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 12 },
  note: { fontSize: 13, lineHeight: 19, marginTop: 16 },
});
