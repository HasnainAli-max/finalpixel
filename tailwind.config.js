/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}"
  ],
  darkMode: 'class', // ✅ Enables dark mode using a class
  theme: {
    extend: {
      colors: {
        primary: '#1E3A8A', // Tailwind blue-800
        secondary: '#FFFFFF'
      }
    }
  },
  plugins: [require('@tailwindcss/typography')]
}

