import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'node-idle': '#374151',
        'node-running': '#2563eb',
        'node-success': '#16a34a',
        'node-error': '#dc2626',
        'node-warning': '#d97706',
      },
    },
  },
  plugins: [],
};

export default config;
