/* FILE: packages/frontend/tailwind.config.js */
import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';

import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    path.join(__dirname, './index.html'),
    path.join(__dirname, './src/**/*.{js,ts,jsx,tsx,html}'),
    path.join(__dirname, '../../extensions/plugins/**/frontend/**/*.{js,ts,jsx,tsx,html}')
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
      // The 'colors' object has been removed to enforce the use of direct CSS variables
      // and prevent build-time race conditions with Tailwind's utility generation.
      // The single source of truth for all theme colors is now `_base.css`.
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