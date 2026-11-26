// The SVG icons of puppyplace.ng/pets.html, path for path.
import Svg, { Circle, Path, Rect } from 'react-native-svg';

type P = { size?: number; color?: string; fill?: string };

export const SearchIco = ({ size = 22, color = '#fff', sw = 2 }: P & { sw?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round">
    <Circle cx="11" cy="11" r="7" />
    <Path d="m20 20-3.5-3.5" />
  </Svg>
);

export const HeartIco = ({ size = 22, color = '#fff', fill = 'none', sw = 2 }: P & { sw?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinejoin="round">
    <Path fill={fill} d="M12 20s-7.5-4.6-9.2-9.3C1.7 7.6 3.8 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.2 0 5.3 3.1 4.2 6.2C19.5 15.4 12 20 12 20Z" />
  </Svg>
);

export const ChatIco = ({ size = 22, color = '#fff' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </Svg>
);

export const UserIco = ({ size = 22, color = '#fff' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="12" cy="8" r="4" />
    <Path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
  </Svg>
);

export const ShieldPlusIco = ({ size = 26, color }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round">
    <Path d="M12 2.5 4 5.5v6c0 5 3.4 8.8 8 10 4.6-1.2 8-5 8-10v-6l-8-3Z" />
    <Path d="M12 7.5v8M8 11.5h8" strokeLinecap="round" />
  </Svg>
);

export const TruckIco = ({ color }: P) => (
  <Svg width={28} height={26} viewBox="0 0 26 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round">
    <Path d="M2 5h13v11H2zM15 9h5l3.5 4v3H15z" />
    <Circle cx="6.5" cy="18" r="2" fill="#151513" />
    <Circle cx="19" cy="18" r="2" fill="#151513" />
  </Svg>
);

export const HeadsetIco = ({ size = 26, color }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round">
    <Path d="M4 14v-2a8 8 0 0 1 16 0v2" />
    <Rect x="3" y="13" width="4" height="6" rx="1.5" />
    <Rect x="17" y="13" width="4" height="6" rx="1.5" />
    <Path d="M19 19c0 1.5-1.5 2.5-4 2.5h-2" />
  </Svg>
);

export const OthersIco = ({ color }: P) => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8}>
    <Circle cx="7" cy="7" r="3.5" />
    <Circle cx="17" cy="7" r="3.5" />
    <Circle cx="7" cy="17" r="3.5" />
    <Circle cx="17" cy="17" r="3.5" />
  </Svg>
);

export const FunnelIco = ({ size = 15, color }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round">
    <Path d="M3 4h18l-7 8.5V19l-4 2v-8.5L3 4Z" />
  </Svg>
);

export const ChevIco = ({ size = 12, color }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round">
    <Path d="m6 9 6 6 6-6" />
  </Svg>
);

export const GridIco = ({ color }: P) => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2}>
    <Rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <Rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <Rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <Rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </Svg>
);

export const ListIco = ({ color }: P) => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round">
    <Path d="M9 6h12M9 12h12M9 18h12" />
    <Circle cx="4" cy="6" r=".6" fill={color} />
    <Circle cx="4" cy="12" r=".6" fill={color} />
    <Circle cx="4" cy="18" r=".6" fill={color} />
  </Svg>
);

export const CloseIco = ({ size = 20, color }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round">
    <Path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const PinIco = ({ size = 11, color, sw = 2.2 }: P & { sw?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw}>
    <Path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" />
    <Circle cx="12" cy="9.5" r="2.5" />
  </Svg>
);

export const CalIco = ({ color }: P) => (
  <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
    <Rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <Path d="M3.5 10h17M8 3v4M16 3v4" strokeLinecap="round" />
  </Svg>
);

export const ShieldOkIco = ({ color }: P) => (
  <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round">
    <Path d="M12 2.5 4 5.5v6c0 5 3.4 8.8 8 10 4.6-1.2 8-5 8-10v-6l-8-3Z" />
    <Path d="m8.5 12 2.5 2.5 4.5-5" strokeLinecap="round" />
  </Svg>
);

export const ArrowIco = ({ color }: P) => (
  <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);
