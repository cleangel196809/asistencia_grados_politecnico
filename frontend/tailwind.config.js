/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          500: '#1e3a5f',
          600: '#1a3354',
          700: '#162d49',
        }
      }
    },
  },
  plugins: [],
}
