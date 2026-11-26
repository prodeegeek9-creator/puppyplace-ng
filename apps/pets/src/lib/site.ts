// The look of puppyplace.ng/pets.html (templates/pets.html), for the app's home
// screen: the same colours, fonts and listing rules (pet-cards.js).
import type { Pet } from '@/lib/api';

export const C = {
  orange: '#ed6436',
  orangeD: '#d9541f',
  green: '#1fa463',
  trustGreen: '#2fbf71',
  dark: '#121210',
  hero: '#151513',
  text: '#1d1d1b',
  gray: '#7a7d85',
  light: '#f6f7f9',
  border: '#e8eaee',
  white: '#ffffff',
  meta: '#8a8d94',
  spec: '#4a4d55',
  check: '#c9ccd3',
  heading: '#111111',
  soldGray: '#6b7280',
  stamp: '#d32f2f',
};

// Plus Jakarta Sans for the page, Nunito for the logo (loaded in app/_layout.tsx)
export const F = {
  400: 'PlusJakartaSans_400Regular',
  500: 'PlusJakartaSans_500Medium',
  600: 'PlusJakartaSans_600SemiBold',
  700: 'PlusJakartaSans_700Bold',
  800: 'PlusJakartaSans_800ExtraBold',
  logo: 'Nunito_900Black',
} as const;

// box-shadow: 0 2px 10px rgba(16,24,40,.06)
export const shadow = {
  shadowColor: '#101828',
  shadowOpacity: 0.06,
  shadowRadius: 5,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
};

export const MAIN_TYPES = ['Dog', 'Cat', 'Bird', 'Rabbit', 'Fish'];

export const TYPE_EMOJI: Record<string, string> = {
  Dog: '🐕', Cat: '🐈', Bird: '🦜', Rabbit: '🐰', Fish: '🐠', 'Guinea Pig': '🐹', Reptile: '🦎',
};

// The card's background when a pet has no photo (linear-gradient(135deg, a, b))
export const TYPE_BG: Record<string, [string, string]> = {
  Dog: ['#fdeee7', '#fbd4c3'],
  Cat: ['#e8f5e9', '#c8e6c9'],
  Bird: ['#e3f2fd', '#bbdefb'],
  Rabbit: ['#f3e5f5', '#e1bee7'],
  Fish: ['#e0f7fa', '#b2ebf2'],
  'Guinea Pig': ['#fff9c4', '#fff59d'],
  Reptile: ['#f1f8e9', '#dcedc8'],
};

export const PILLS = [
  { type: 'all', label: 'All', emoji: '🐾' },
  { type: 'Dog', label: 'Dogs', emoji: '🐕' },
  { type: 'Cat', label: 'Cats', emoji: '🐱' },
  { type: 'Bird', label: 'Birds', emoji: '🦜' },
  { type: 'Rabbit', label: 'Rabbits', emoji: '🐰' },
  { type: 'Fish', label: 'Fish', emoji: '🐠' },
  { type: 'other', label: 'Others', emoji: null },
];

export const fmtNaira = (n: number) => '₦' + Number(n).toLocaleString('en-NG');

// Age is free text ("9 weeks", "5 months", "1.5 years"); turn it into weeks
export function ageWeeks(a?: string | null) {
  const m = String(a || '').toLowerCase().match(/(\d+(?:\.\d+)?)\s*(w|m|y|d)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return ({ d: n / 7, w: n, m: n * 4.345, y: n * 52 } as Record<string, number>)[m[2]];
}

// The pets table has no gender column yet, so read it from the listing text
export function genderOf(p: Pet & { gender?: string; sex?: string }) {
  const g = String(p.gender || p.sex || '').toLowerCase();
  if (g) return g.startsWith('f') ? 'Female' : g.startsWith('m') ? 'Male' : g.startsWith('p') ? 'Pair' : '';
  const t = `${p.name || ''} ${p.specs || ''}`.toLowerCase();
  if (/\b(pair|male and female|male & female|males and females)\b/.test(t)) return 'Pair';
  if (/\bfemale\b/.test(t)) return 'Female';
  if (/\bmale\b/.test(t)) return 'Male';
  return '';
}

export type Filters = {
  types: string[];
  age: string;
  gender: string;
  loc: string;
  vac: string;
  min: string;
  max: string;
  q: string;
  sort: 'newest' | 'price-asc' | 'price-desc';
};

export const NO_FILTERS: Filters = { types: [], age: '', gender: '', loc: '', vac: '', min: '', max: '', q: '', sort: 'newest' };

// The same rules as the page's own script
export function matches(p: Pet, s: Filters) {
  if (s.types.length) {
    const t = MAIN_TYPES.includes(p.type) ? p.type : 'other';
    if (!s.types.includes(t)) return false;
  }
  if (s.age) {
    const [lo, hi] = s.age.split('-').map(Number);
    const w = ageWeeks(p.age);
    if (w == null || w < lo || w >= hi) return false;
  }
  if (s.gender) {
    const g = genderOf(p);
    if (g !== s.gender && g !== 'Pair') return false;
  }
  if (s.loc && String(p.location || '').trim().toLowerCase() !== s.loc.toLowerCase()) return false;
  if (s.vac === 'yes' && !p.vaccinated) return false;
  if (s.vac === 'no' && p.vaccinated) return false;
  if (s.min !== '' || s.max !== '') {
    const price = p.listing_type === 'adoption' ? 0 : p.price;
    if (price == null) return false;
    if (s.min !== '' && price < Number(s.min)) return false;
    if (s.max !== '' && price > Number(s.max)) return false;
  }
  if (s.q) {
    const hay = [p.breed, p.type, p.location, p.name, p.breeder, p.listing_type === 'adoption' ? 'adoption adopt' : 'sale']
      .join(' ')
      .toLowerCase();
    if (!s.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}

export function sortPets(pets: Pet[], sort: Filters['sort']) {
  let out = pets;
  if (sort !== 'newest') {
    const val = (p: Pet) => (p.listing_type === 'adoption' ? 0 : (p.price ?? null));
    const dir = sort === 'price-asc' ? 1 : -1;
    out = pets.slice().sort((a, b) => {
      const x = val(a), y = val(b);
      if (x === null) return 1;
      if (y === null) return -1;
      return (x - y) * dir;
    });
  }
  // Sold pets after the ones still available, whatever the sort.
  return [...out.filter((p) => !p.sold_at), ...out.filter((p) => p.sold_at)];
}

export const AGE_OPTIONS = [
  { value: '', label: 'Any age' },
  { value: '0-12', label: 'Under 3 months' },
  { value: '12-26', label: '3 – 6 months' },
  { value: '26-52', label: '6 – 12 months' },
  { value: '52-9999', label: '1 year +' },
];
export const VAC_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];
export const MIN_OPTIONS = [{ value: '', label: 'Min' }, ...[0, 50000, 100000, 200000, 300000, 500000, 1000000].map((n) => ({ value: String(n), label: fmtNaira(n) }))];
export const MAX_OPTIONS = [{ value: '', label: 'Max' }, ...[50000, 100000, 200000, 300000, 500000, 1000000, 2000000].map((n) => ({ value: String(n), label: fmtNaira(n) }))];
export const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
];

// What /api/pets-page sends: the page's own words below the listings
export type PageText = {
  h1: { text: string; accent: string; after: string }[];
  sub: string;
  buy_title: string;
  buy_intro: string;
  checked: string;
  sell_title: string;
  sell_text: string;
  sell_cta: { label: string; href: string };
  adoption_cta: { label: string; href: string } | null;
  browse: { title: string; links: { href: string; label: string; n: number | null }[] }[];
  faq_title: string;
  faqs: { q: string; a: string }[];
};

// Used until /api/pets-page answers (and if it can't)
export const DEFAULT_HERO = {
  h1: [
    { text: 'Find Your Perfect Pet', accent: '', after: '' },
    { text: 'in ', accent: 'Nigeria', after: '' },
  ],
  sub: 'Buy, sell or adopt healthy dogs, cats, birds, rabbits and more from trusted breeders across Nigeria.',
};
