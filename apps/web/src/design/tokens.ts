/**
 * Typed public contract for the Apple Books Compact visual foundation.
 * Runtime values live in shared/theme CSS; this map prevents consumers from inventing token names.
 */
export const designTokens = {
  typography: {
    display: '--type-display-size',
    pageTitle: '--type-headline-size',
    sectionTitle: '--type-title-size',
    cardTitle: '--type-title-sm-size',
    body: '--type-body-size',
    supporting: '--type-supporting-size',
    metadata: '--type-metadata-size',
    caption: '--type-caption-size',
    label: '--type-label-size'
  },
  spacing: {
    xxs: '--space-1',
    xs: '--space-2',
    sm: '--space-3',
    md: '--space-4',
    lg: '--space-6',
    xl: '--space-8',
    xxl: '--space-10',
    section: '--space-12',
    page: '--space-16'
  },
  radius: {
    small: '--radius-sm',
    control: '--radius-md',
    card: '--radius-lg',
    overlay: '--radius-xl',
    pill: '--radius-pill'
  },
  motion: {
    instant: '--motion-instant',
    fast: '--motion-fast',
    normal: '--motion-normal',
    slow: '--motion-slow'
  },
  icons: {
    small: '--icon-sm',
    medium: '--icon-md',
    large: '--icon-lg'
  },
  layout: {
    contentMax: '--content-max',
    mobileMax: '--app-mobile-max',
    readerMax: '--reader-max',
    pageGutter: '--page-gutter'
  },
  colors: {
    background: '--color-bg',
    surface: '--color-surface',
    surfaceElevated: '--color-bg-elevated',
    border: '--color-border',
    textPrimary: '--color-text',
    textSecondary: '--color-text-secondary',
    textTertiary: '--color-muted',
    primary: '--color-primary',
    success: '--color-success',
    warning: '--color-warning',
    danger: '--color-danger'
  }
} as const;

export type DesignTokenGroup = keyof typeof designTokens;
