/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Warm paper background with deep green ink, after the palette in DESIGN.md.
        paper: '#F8F6F1',
        ink: {
          DEFAULT: '#0F2A23',
          soft: '#4F6B63',
          faint: '#8A9C96',
        },
        line: {
          DEFAULT: '#DCE2DE',
          strong: '#B9C6C1',
        },
        mist: '#DCEBEA',
        brand: {
          DEFAULT: '#C1E05A', // lime, used for the primary action
          hover: '#B2D443',
        },
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro', 'sans-serif'],
        display: ['"Inter Tight"', 'Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      letterSpacing: {
        label: '0.08em',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
