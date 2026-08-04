// Design System Configuration (Pure JS/TS to avoid unnecessary dependencies)

// Design System Colors based on the provided logo (Yellow/Orange and Dark)
export const themeColors = {
  primary: {
    main: '#FFB800', // Gold/Yellow from logo
    dark: '#E5A600',
    light: '#FFC933',
    contrastText: '#000000',
  },
  secondary: {
    main: '#FF5C00', // Orange gradient from logo
    dark: '#CC4A00',
    light: '#FF7D33',
    contrastText: '#FFFFFF',
  },
  background: {
    default: '#000000', // Dark theme for mobile/battery efficiency
    paper: '#121212',
    surface: '#1E1E1E',
  },
  text: {
    primary: '#FFFFFF',
    secondary: '#B0B0B0',
    hint: '#757575',
  },
  divider: 'rgba(255, 255, 255, 0.12)',
};

// Spacing Scale (8pt grid)
export const spacing = (factor: number) => factor * 8;

// Typography System
export const typography = {
  fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  h1: { fontSize: '2.125rem', fontWeight: 700, letterSpacing: '0.015em' },
  h2: { fontSize: '1.5rem', fontWeight: 600, letterSpacing: '0.01em' },
  subtitle1: { fontSize: '1rem', fontWeight: 500, letterSpacing: '0.009em' },
  body1: { fontSize: '1rem', fontWeight: 400, letterSpacing: '0.031em' },
  button: { textTransform: 'none', fontWeight: 600 },
};
