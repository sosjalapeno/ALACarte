import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: 'rgb(var(--accent) / <alpha-value>)',
        indicator: 'rgb(var(--indicator) / <alpha-value>)',
        app: {
          bg: 'var(--bg)',
          text: 'var(--text)',
          dim: 'var(--text-dim)',
          faint: 'var(--text-faint)',
          border: 'var(--border-color)',
        },
        surface: {
          0: 'rgba(0, 0, 0, 0.9)',
          1: 'rgba(0, 0, 0, 0.5)',
          2: 'rgba(0, 0, 0, 0.3)',
        },
      },
      borderRadius: {
        app: 'var(--radius)',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.16, 1, 0.3, 1)',
        snappy: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      keyframes: {
        'drawer-fade': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'drawer-slide': {
          from: {
            transform: 'translateX(calc(-100% - 16px))',
            opacity: '0.4',
          },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        'modal-fade': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'modal-rise': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'drawer-fade': 'drawer-fade 180ms var(--ease)',
        'drawer-slide': 'drawer-slide 220ms var(--ease)',
        'modal-fade': 'modal-fade 180ms var(--ease)',
        'modal-rise': 'modal-rise 200ms var(--ease)',
      },
    },
  },
  plugins: [],
} satisfies Config
