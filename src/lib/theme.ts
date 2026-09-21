export const colors = {
  primary: '#163A5F', // UgO NITK Navy
  primaryLight: '#EAF2F8', // Soft navy tint
  navy: '#163A5F',
  navyDark: '#0F2D4A',
  accent: '#159447', // UgO Emerald Green
  accentGreen: '#159447',
  accentGreenDark: '#0F7A38',
  accentBlue: '#2563EB',
  warning: '#D99A24',
  danger: '#D64545',
  success: '#159447',
  info: '#2563EB',
  background: '#FFFFFF',
  backgroundDark: '#F7F9FC', // Light surface background across app
  backgroundLight: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceLight: '#F8FAFC',
  surfaceBorder: '#E5E7EB',
  border: '#E5E7EB',
  borderLight: '#F1F5F9',
  textPrimary: '#17202A',
  textSecondary: '#667085',
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