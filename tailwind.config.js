/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{ts,tsx}',
    './src/**/*.html',
  ],
  theme: {
    extend: {
      colors: {
        dumbify: {
          bg: '#202020',
          surface: '#2a2a2a',
          border: '#333333',
          text: '#FFFFFF',
          secondary: 'rgba(255,255,255,0.75)',
          muted: 'rgba(255,255,255,0.45)',
          accent: '#4fc3f7',
        },
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', '"Times New Roman"', 'Times', 'serif'],
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"SF Mono"', '"Fira Code"', '"Fira Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        'display': ['48px', { lineHeight: '1.2', fontWeight: '700' }],
        'heading': ['28px', { lineHeight: '1.3', fontWeight: '600' }],
        'subheading': ['20px', { lineHeight: '1.4', fontWeight: '500' }],
        'body': ['16px', { lineHeight: '1.6' }],
        'caption': ['14px', { lineHeight: '1.5' }],
        'small': ['12px', { lineHeight: '1.4' }],
      },
      maxWidth: {
        'content': '900px',
      },
      spacing: {
        'page': '80px',
        'section': '48px',
        'element': '24px',
        'tight': '12px',
      },
      animation: {
        'fade-in': 'fadeIn 150ms ease-out',
        'fade-out': 'fadeOut 150ms ease-in',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
      },
    },
  },
  plugins: [],
}
