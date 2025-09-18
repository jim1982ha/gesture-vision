/* FILE: packages/frontend/tailwind.config.js */
import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{ts,js,html}',
    '../../extensions/plugins/**/frontend/**/*.{js,html}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      screens: {
        desktop: '1024px',
      },
      spacing: {
        'main-x-desktop': 'var(--main-content-horizontal-padding-desktop, 2rem)',
      },
      colors: {
        primary: 'rgb(var(--color-primary) / <alpha-value>)',
        'primary-hover': 'rgb(var(--color-primary-hover) / <alpha-value>)',
        secondary: 'rgb(var(--color-secondary) / <alpha-value>)',
        'secondary-hover': 'rgb(var(--color-secondary-hover) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        background: 'rgb(var(--color-background) / <alpha-value>)',
        'on-primary': 'rgb(var(--color-on-primary) / <alpha-value>)',
        'text-primary': 'rgb(var(--color-text-primary) / <alpha-value>)',
        'text-secondary': 'rgb(var(--color-text-secondary) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        'border-light': 'rgb(var(--color-border-light) / <alpha-value>)',
        error: {
          DEFAULT: 'rgb(var(--color-error) / <alpha-value>)',
          hover: 'rgb(var(--color-error-hover) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'rgb(var(--color-success) / <alpha-value>)',
          hover: 'rgb(var(--color-success-hover) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--color-warning) / <alpha-value>)',
          hover: 'rgb(var(--color-warning-hover) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--color-info) / <alpha-value>)',
          hover: 'rgb(var(--color-info-hover) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: [
          'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont',
          '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif',
        ],
      },
      zIndex: {
        header: '300',
        backdrop: '390',
        sidebar: '400',
        'sidebar-toggle': '401',
        'bottom-nav': '500',
        'modal-overlay': '900',
        'modal-content': '901',
        dropdown: '1000',
        alert: '1100',
      },
    },
  },
  plugins: [
    forms,
    typography,
  ],
};