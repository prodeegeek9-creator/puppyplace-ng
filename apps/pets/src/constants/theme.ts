import { useColorScheme } from 'react-native';

// PuppyPlace's own colours (the website's orange and ink).
const light = {
  brand: '#ed6436',
  brandSoft: '#fdeee7',
  text: '#1a1a18',
  textSecondary: '#6b6b6b',
  background: '#ffffff',
  surface: '#f6f7f8',
  border: '#e9ecef',
  success: '#1e9e57',
  danger: '#d63c2f',
  whatsapp: '#1faa55',
  onBrand: '#ffffff',
};

const dark: typeof light = {
  brand: '#f07a52',
  brandSoft: '#3a2219',
  text: '#f4f4f2',
  textSecondary: '#a6a6a2',
  background: '#121211',
  surface: '#1e1e1c',
  border: '#2e2e2b',
  success: '#3ccf7d',
  danger: '#ff6b5e',
  whatsapp: '#2fc26a',
  onBrand: '#ffffff',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
