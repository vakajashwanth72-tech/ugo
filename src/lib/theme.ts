export const colors = {
  primary: '#0284C7', // Theme 2: Sky Blue (Sky-600)
  primaryLight: '#E0F2FE', // Soft ice sky tint (Sky-100)
  primaryDark: '#0369A1', // Deep sky blue (Sky-700)
  navy: '#0369A1',
  navyDark: '#075985',
  accent: '#0284C7', // Consistent Sky Blue active accent
  accentSky: '#38BDF8', // Bright sky highlight (Sky-400)
  accentGreen: '#10B981',
  accentGreenDark: '#059669',
  accentBlue: '#0284C7',
  warning: '#D97706',
  danger: '#EF4444',
  success: '#10B981',
  info: '#0284C7',
  background: '#FFFFFF',
  backgroundDark: '#F0F9FF', // Clean ice blue background (Sky-50)
  backgroundLight: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceLight: '#F0F9FF',
  surfaceBorder: '#BAE6FD', // Soft sky border (Sky-200)
  border: '#E2E8F0',
  borderLight: '#F0F9FF',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textLight: '#94A3B8',
  white: '#FFFFFF',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const typography = {
  h1: { fontSize: 28, fontWeight: '800' as const, lineHeight: 34 },
  h2: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28 },
  h3: { fontSize: 18, fontWeight: '700' as const, lineHeight: 24 },
  body1: { fontSize: 16, fontWeight: '400' as const, lineHeight: 22 },
  body2: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: '500' as const, lineHeight: 16 },
};

export const borderRadius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
  },
};

export const theme = {
  colors,
  spacing,
  typography,
  borderRadius,
  shadows,
};

// Extra time billing constants matching the web app
export const EXTRA_TIME_RATE_PER_MINUTE = 2;
export const GRACE_PERIOD_MINUTES = 10;
export const LOW_TIME_WARNING_MINUTES = 5;