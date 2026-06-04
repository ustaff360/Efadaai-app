/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.jsx',
    './src/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        'navy': '#0F172A',
        'navy-light': '#151E30',
        'primary': '#3B8CFF',
        'primary-hover': '#297DEE',
        'success': '#00C88A',
        'warning': '#F5A623',
        'danger': '#E53317',
        'info': '#0888FF',
        'text-dark': '#0F172A',
        'text-gray': '#6B748F',
        'text-muted': '#94A1B6',
        'bg-light': '#F0F4FA',
        'border': '#E1E6ED',
      },
      fontFamily: {
        'heading': ['Inter', 'system-ui', 'sans-serif'],
        'sans': ['Inter', 'system-ui', 'sans-serif'],
        'mono': ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'soft': '0 1px 3px rgba(15,23,42,0.08)',
      },
    },
  },
  plugins: [],
}
