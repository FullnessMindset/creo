/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./**/*.html", "./shared.js"],
  theme: {
    extend: {
      colors: {
        creo: {
          purple: '#1a0a3e',
          light: '#2d1b69',
          mint: '#33f0b0',
          mintDark: '#28c48e',
        },
        stripe: {
          purple: '#635bff',
          dark: '#0a2540',
        }
      }
    }
  },
  plugins: [],
}
