/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        chrome: {
          shell: 'var(--chrome-shell)',
          surface: 'var(--chrome-surface)',
          border: 'var(--chrome-border)',
          accent: 'var(--chrome-accent)',
          muted: 'var(--chrome-muted)',
          selection: 'var(--chrome-selection)',
          'selection-fg': 'var(--chrome-selection-fg)',
          'settings-selection': 'var(--chrome-settings-selection)',
          scrim: 'var(--chrome-scrim)',
        },
      },
      borderRadius: {
        'chrome-panel': '0.75rem',
        'chrome-modal': '1rem',
      },
    },
  },
  plugins: [],
};
