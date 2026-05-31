import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        'off-white': '#FAF8F5',
        'electric-purple': '#6800FF',
        'vibrant-blue': '#0098F5',
        'soft-lavender': '#CAB1FF',
        'pure-black': '#000000',
        'on-surface': '#1b1b1b',
        'on-surface-variant': '#494457',
        'surface-dim': '#dadada',
        'surface-container': '#eeeeee',
        'primary-container': '#6800ff',
        error: '#ba1a1a',
      },
      fontFamily: {
        display: ['var(--font-space-grotesk)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'ui-monospace', 'monospace'],
      },
      maxWidth: {
        container: '1280px',
      },
      spacing: {
        margin: '40px',
        gutter: '24px',
      },
      boxShadow: {
        neo: '4px 4px 0px 0px #000000',
        'neo-lg': '8px 8px 0px 0px #000000',
        'neo-purple': '2px 2px 0px 0px #6800FF',
      },
    },
  },
  plugins: [],
};

export default config;
