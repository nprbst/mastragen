/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        dark: {
          bg: {
            primary: '#0a0a0f',
            secondary: '#12121a',
            tertiary: '#1a1a25',
          },
          text: {
            primary: '#f0f0f5',
            secondary: '#8888a0',
            muted: '#555570',
          },
          border: '#2a2a3a',
        },
      },
    },
  },
  plugins: [],
};
