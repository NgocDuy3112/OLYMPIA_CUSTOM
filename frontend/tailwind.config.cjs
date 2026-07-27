module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      screens: {
        'tablet': '768px',
      },
      colors: {
        // Brand tokens
        primary: '#0609cd',
        'primary-dark': '#1E4EDD',
        secondary: '#FFB547',
        muted: '#94A3B8',
        'bg-base': '#0609cd',
        surface: 'rgba(255,255,255,0.12)',
        'text-primary': '#E6EEF5',

        // Override default blue palette so existing bg-blue-*/text-blue-* classes follow brand
        blue: {
            '50': '#e8f1ff',
            '100': '#d5e4ff',
            '200': '#b3ccff',
            '300': '#85a8ff',
            '400': '#5676ff',
            '500': '#2f45ff',
            '600': '#0c0eff',
            '700': '#0000ff',
            '800': '#0609cd',
            '900': '#10169f',
            '950': '#0a0b5c',
        },
      },
      backgroundImage: {
        'oc': "url('/background/OC3_background.png')",
      },
    },
  },
  plugins: [],
}
