import * as SecureStore from 'expo-secure-store';

// Everything comes from the PuppyPlace website's own API (worker.js).
export const SITE = 'https://puppyplace.ng';
const TOKEN_KEY = 'pp_session';

let token: string | null = null;

export async function loadToken() {
  try {
    token = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    token = null;
  }
  return token;
}

export async function saveToken(t: string | null) {
  token = t;
  try {
    if (t) await SecureStore.setItemAsync(TOKEN_KEY, t);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    /* keeps working for this run */
  }
}

export class ApiError extends Error {
  status: number;
  login: boolean;
  details: string[];
  constructor(message: string, status: number, body: any) {
    super(message);
    this.status = status;
    this.login = Boolean(body?.login) || status === 401;
    this.details = Array.isArray(body?.details) ? body.details : [];
  }
}

export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${SITE}${path}`, {
      method: body !== undefined ? 'POST' : 'GET',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'omit',
    });
  } catch {
    throw new ApiError('No connection. Check your internet and try again.', 0, null);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error || 'Something went wrong. Try again.', res.status, data);
  return data as T;
}

export const errorText = (e: unknown) =>
  e instanceof ApiError ? [e.message, ...e.details].join('\n') : 'Something went wrong. Try again.';

export type Pet = {
  id: number | string;
  slug: string;
  breed: string;
  name?: string | null;
  breeder?: string | null;
  type: string;
  listing_type: 'sale' | 'adoption';
  pedigree?: string | null;
  price?: number | null;
  age?: string | null;
  specs?: string | null;
  location?: string | null;
  image_url?: string | null;
  image_urls?: string[] | null;
  dewormed?: boolean;
  vaccinated?: boolean;
  sold_at?: string | null;
  created_at?: string;
  contact?: boolean;
  active?: boolean;
};

export type Account = { name: string | null; phone: string };

export type Thread = {
  id: string;
  slug: string;
  breed: string;
  photo: string | null;
  role: 'buyer' | 'seller';
  with: string;
  unread: number;
  flagged: boolean;
  last: string | null;
  last_message_at: string;
};

export type Message = {
  sender: 'buyer' | 'seller';
  body: string;
  created_at: string;
  flagged?: boolean;
  mine: boolean;
};

export const PET_TYPES = ['Dog', 'Cat', 'Bird', 'Rabbit', 'Fish', 'Guinea Pig', 'Reptile', 'Other'];

export const TYPE_EMOJI: Record<string, string> = {
  Dog: '🐕',
  Cat: '🐈',
  Bird: '🦜',
  Rabbit: '🐰',
  Fish: '🐠',
  'Guinea Pig': '🐹',
  Reptile: '🦎',
};

export const naira = (n: number) => '₦' + Math.round(Number(n)).toLocaleString('en-NG');

export function priceLabel(p: Pet) {
  if (p.listing_type === 'adoption') return 'Free to adopt';
  return p.price ? naira(p.price) : 'Price on request';
}

export const soldWord = (p: Pet) => (p.listing_type === 'adoption' ? 'Adopted' : 'Sold');

export function photosOf(p: Pet): string[] {
  const list = (p.image_urls && p.image_urls.length ? p.image_urls : p.image_url ? [p.image_url] : []).filter(
    (u): u is string => typeof u === 'string' && u.length > 0,
  );
  return [...new Set(list)];
}

// The site's photo links take ?w= for a resized copy (see /img in worker.js).
export function sized(u: string, w: number) {
  return /(\/storage\/v1\/object\/public\/hero-images\/|puppyplace\.ng\/img\/)/.test(u) && !u.includes('?')
    ? `${u}?w=${w}`
    : u;
}

export function timeAgo(iso?: string | null) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}
