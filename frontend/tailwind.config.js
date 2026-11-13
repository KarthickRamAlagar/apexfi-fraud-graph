/** @type {import('tailwindcss').Config} */
// ApexFi uses the same design tokens as the DEM / AETHER GIS workspace.
// Two families of tokens, both switched by html[data-theme]:
//  - shadcn-style (hsl):  background, card, primary ...   (used by the existing ApexFi pages)
//  - DEM-style (rgb):     ink-950 .. ink-100, signal-*     (used by the new layout, Ops, Settings, PDF previews)
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    container: { center: true, padding: '1.5rem' },
    extend: {
      colors: {
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        primary: { DEFAULT: 'hsl(var(--primary) / <alpha-value>)', foreground: 'hsl(var(--primary-foreground) / <alpha-value>)' },
        secondary: { DEFAULT: 'hsl(var(--secondary) / <alpha-value>)', foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)' },
        muted: { DEFAULT: 'hsl(var(--muted) / <alpha-value>)', foreground: 'hsl(var(--muted-foreground) / <alpha-value>)' },
        accent: { DEFAULT: 'hsl(var(--accent) / <alpha-value>)', foreground: 'hsl(var(--accent-foreground) / <alpha-value>)' },
        card: { DEFAULT: 'hsl(var(--card) / <alpha-value>)', foreground: 'hsl(var(--card-foreground) / <alpha-value>)' },
        risk: {
          high: 'hsl(var(--risk-high) / <alpha-value>)',
          medium: 'hsl(var(--risk-medium) / <alpha-value>)',
          low: 'hsl(var(--risk-low) / <alpha-value>)',
        },
        ink: {
          950: 'rgb(var(--ink-950) / <alpha-value>)',
          900: 'rgb(var(--ink-900) / <alpha-value>)',
          850: 'rgb(var(--ink-850) / <alpha-value>)',
          800: 'rgb(var(--ink-800) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          600: 'rgb(var(--ink-600) / <alpha-value>)',
          500: 'rgb(var(--ink-500) / <alpha-value>)',
          400: 'rgb(var(--ink-400) / <alpha-value>)',
          300: 'rgb(var(--ink-300) / <alpha-value>)',
          200: 'rgb(var(--ink-200) / <alpha-value>)',
          100: 'rgb(var(--ink-100) / <alpha-value>)',
        },
        signal: {
          teal: 'rgb(var(--signal-teal) / <alpha-value>)',
          gold: 'rgb(var(--signal-gold) / <alpha-value>)',
          amber: 'rgb(var(--signal-amber) / <alpha-value>)',
          red: 'rgb(var(--signal-red) / <alpha-value>)',
          green: 'rgb(var(--signal-green) / <alpha-value>)',
          violet: 'rgb(var(--signal-violet) / <alpha-value>)',
          sky: 'rgb(var(--signal-sky) / <alpha-value>)',
          lime: 'rgb(var(--signal-lime) / <alpha-value>)',
          coral: 'rgb(var(--signal-coral) / <alpha-value>)',
        },
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        sans: ['"Space Grotesk"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      boxShadow: { panel: '0 20px 60px -20px rgba(0,0,0,0.6)' },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
