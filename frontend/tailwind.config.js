/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        surface: 'var(--surface)',
        card: 'var(--card)',
        canvas: 'var(--canvas)',
        input: 'var(--input)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        faint: 'var(--faint)',
        primary: {
          DEFAULT: 'var(--primary)',
          hover: 'var(--primary-hover)',
        },
        'on-primary': 'var(--on-primary)',
        // Warm-neutral "brand" scale so the legacy Resume/Analysis views and
        // shared components harmonise with the editorial palette (fixed values
        // so dark buttons + white text stay legible on their light cards).
        brand: {
          50: '#f1efe9',
          100: '#e8e5de',
          200: '#dcd8cf',
          300: '#c9c3b8',
          400: '#9b958a',
          500: '#4a4842',
          600: '#262522',
          700: '#1d1c1a',
          800: '#1d1c1a',
          900: '#1d1c1a',
        },
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        'line-input': 'var(--line-input)',
        danger: 'var(--danger)',
        'danger-surface': 'var(--danger-surface)',
        warning: 'var(--warning)',
        'warning-surface': 'var(--warning-surface)',
        success: 'var(--success)',
        'success-surface': 'var(--success-surface)',
        'status-draft': 'var(--status-draft)',
        'status-sent': 'var(--status-sent)',
        'status-screening': 'var(--status-screening)',
        'status-interview': 'var(--status-interview)',
        'status-offer': 'var(--status-offer)',
        'status-accepted': 'var(--status-accepted)',
        'status-rejected': 'var(--status-rejected)',
      },
      borderColor: {
        DEFAULT: 'var(--line)',
      },
      borderRadius: {
        control: '8px',
        card: '12px',
        panel: '12px',
        dialog: '16px',
      },
      boxShadow: {
        raised: 'var(--shadow-raised)',
        cta: 'var(--shadow-cta)',
        panel: 'var(--shadow-panel)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Newsreader', 'Georgia', 'serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        meta: ['13px', '1.45'],
        control: ['13.5px', '1.4'],
        field: ['14.5px', '1.4'],
        lead: ['15px', '1.55'],
      },
    },
  },
  plugins: [],
}
