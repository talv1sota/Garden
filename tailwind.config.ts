import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        pixel: ['var(--font-pixel)', 'monospace'],
      },
      colors: {
        parchment: { light: '#fef9ef', DEFAULT: '#fef3c7', dark: '#fde68a' },
        wood: { light: '#d4a574', DEFAULT: '#6b4423', dark: '#4a2f17' },
        soil: { light: '#a0855c', DEFAULT: '#8b6f47', dark: '#6b4f2e' },
        grass: { light: '#6dbf47', DEFAULT: '#4a8f2c', dark: '#2d5a16' },
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        sprout: {
          '0%': { transform: 'scale(0) translateY(8px)', opacity: '0' },
          '100%': { transform: 'scale(1) translateY(0)', opacity: '1' },
        },
        wiggle: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(-3deg)' },
          '75%': { transform: 'rotate(3deg)' },
        },
      },
      animation: {
        float: 'float 3s ease-in-out infinite',
        sprout: 'sprout 0.3s ease-out',
        wiggle: 'wiggle 0.6s ease-in-out',
      },
    },
  },
  plugins: [],
};

export default config;
