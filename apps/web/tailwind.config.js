/** @type {import('tailwindcss').Config} */
export const tailwindConfig = {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {},
  },
  plugins: [],
}

// Tool configs require export default to function
export default tailwindConfig
