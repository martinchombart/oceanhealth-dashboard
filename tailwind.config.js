/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts}'],
  theme: {
    screens: {
      md: '1024px',   // phones (incl. landscape ≤ 932px) stay mobile; only tablets/desktops get desktop layout
      lg: '1280px',
      xl: '1536px',
    },
    extend: {
      fontFamily: {
        sans:    ['Nunito', 'sans-serif'],
        display: ['Nunito', 'sans-serif'],
        mono:    ['Nunito', 'sans-serif'],
      },
      colors: {
        ocean: {
          50:  '#f0f9ff',   // near-white, panel backgrounds
          100: '#e0f2fe',   // very light blue
          200: '#bae6fd',   // light borders
          300: '#7dd3fc',   // muted accents
          400: '#38bdf8',   // interactive elements
          500: '#0ea5e9',   // primary sky blue
          600: '#0284c7',   // ocean blue
          700: '#0369a1',   // deep blue
          800: '#075985',   // deeper
          900: '#0c4a6e',   // dark navy
          950: '#082f49',   // deepest
          accent: '#0ea5e9', // sky blue — main interactive
          warm:   '#f97316', // orange (temperature warm)
          teal:   '#14b8a6', // teal
          violet: '#8b5cf6',
          amber:  '#f59e0b',
        }
      },
      boxShadow: {
        'glow-blue':   '0 0 20px -4px rgba(14,165,233,0.5)',
        'glow-orange': '0 0 20px -4px rgba(249,115,22,0.5)',
      }
    },
  },
  plugins: [],
}
