// FILE: packages/frontend/postcss.config.cjs
// Use .cjs extension for compatibility with Vite's config loading.
const path = require('path');

module.exports = {
  plugins: {
    tailwindcss: { config: path.resolve(__dirname, 'tailwind.config.js') },
    autoprefixer: {},
  },
};