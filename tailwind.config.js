/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dfeaff',
          500: '#1c78ff',
          600: '#155fe0',
          700: '#0d47b8'
        },
        panel: '#071624',
        navy: '#0f1f2d',
        ink: '#101828',
        lavender: '#f4f2ff'
      },
      boxShadow: {
        soft: '0 10px 30px rgba(16, 24, 40, 0.08)'
      }
    }
  },
  plugins: []
}
