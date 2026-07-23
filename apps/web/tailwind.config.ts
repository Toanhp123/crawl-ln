import type { Config } from 'tailwindcss';

export default {
  future: {
    hoverOnlyWhenSupported: true
  },
  content: {
    relative: true,
    files: ['./index.html', './src/**/*.{ts,tsx}']
  },
  theme: {
    extend: {
      colors: {
        bg: 'hsl(var(--color-bg) / <alpha-value>)',
        surface: 'hsl(var(--color-surface) / <alpha-value>)',
        surface2: 'hsl(var(--color-surface-2) / <alpha-value>)',
        surface3: 'hsl(var(--color-surface-3) / <alpha-value>)',
        border: 'hsl(var(--color-border) / <alpha-value>)',
        'border-strong': 'hsl(var(--color-border-strong) / <alpha-value>)',
        text: 'hsl(var(--color-text) / <alpha-value>)',
        'text-secondary': 'hsl(var(--color-text-secondary) / <alpha-value>)',
        muted: 'hsl(var(--color-muted) / <alpha-value>)',
        primary: 'hsl(var(--color-primary) / <alpha-value>)',
        'primary-hover': 'hsl(var(--color-primary-hover) / <alpha-value>)',
        'primary-pressed': 'hsl(var(--color-primary-pressed) / <alpha-value>)',
        'primary-subtle': 'var(--state-primary-subtle)',
        'primary-state-hover': 'var(--state-primary-hover)',
        'primary-state-pressed': 'var(--state-primary-pressed)',
        'primary-selected': 'var(--state-primary-selected)',
        'primary-state-border': 'var(--state-primary-border)',
        success: 'hsl(var(--color-success) / <alpha-value>)',
        'success-subtle': 'var(--state-success-subtle)',
        'success-state-hover': 'var(--state-success-hover)',
        'success-state-border': 'var(--state-success-border)',
        warning: 'hsl(var(--color-warning) / <alpha-value>)',
        'warning-subtle': 'var(--state-warning-subtle)',
        'warning-state-hover': 'var(--state-warning-hover)',
        'warning-state-border': 'var(--state-warning-border)',
        danger: 'hsl(var(--color-danger) / <alpha-value>)',
        'danger-subtle': 'var(--state-danger-subtle)',
        'danger-state-hover': 'var(--state-danger-hover)',
        'danger-state-border': 'var(--state-danger-border)',
        info: 'hsl(var(--color-info) / <alpha-value>)',
        'info-subtle': 'var(--state-info-subtle)',
        'info-state-hover': 'var(--state-info-hover)',
        'info-state-border': 'var(--state-info-border)'
      },
      fontSize: {
        'type-display': ['var(--type-display-size)', { lineHeight: 'var(--type-display-line)' }],
        'type-headline': ['var(--type-headline-size)', { lineHeight: 'var(--type-headline-line)' }],
        'type-title': ['var(--type-title-size)', { lineHeight: 'var(--type-title-line)' }],
        'type-title-sm': ['var(--type-title-sm-size)', { lineHeight: 'var(--type-title-sm-line)' }],
        'type-body': ['var(--type-body-size)', { lineHeight: 'var(--type-body-line)' }],
        'type-body-sm': ['var(--type-body-sm-size)', { lineHeight: 'var(--type-body-sm-line)' }],
        'type-label': ['var(--type-label-size)', { lineHeight: 'var(--type-label-line)' }],
        'type-supporting': [
          'var(--type-supporting-size)',
          { lineHeight: 'var(--type-supporting-line)' }
        ],
        'type-metadata': ['var(--type-metadata-size)', { lineHeight: 'var(--type-metadata-line)' }],
        'type-caption': ['var(--type-caption-size)', { lineHeight: 'var(--type-caption-line)' }],
        'type-metric-sm': [
          'var(--type-metric-sm-size)',
          { lineHeight: 'var(--type-metric-sm-line)' }
        ],
        'type-metric-lg': [
          'var(--type-metric-lg-size)',
          { lineHeight: 'var(--type-metric-lg-line)' }
        ]
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        pill: 'var(--radius-pill)'
      }
    }
  },
  plugins: []
} satisfies Config;
