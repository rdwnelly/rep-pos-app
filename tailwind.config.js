/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./app/**/*.{js,ts,jsx,tsx}",
        "./index.html.backup",
        "./src/**/*.{js,ts,jsx,tsx}",
        "./screens/**/*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./utils/**/*.{js,ts,jsx,tsx}",
        "./*.{js,ts,jsx,tsx}"
    ],
    theme: {
        extend: {
            colors: {
                primary: 'hsl(var(--primary-h) var(--primary-s) var(--primary-l) / <alpha-value>)', // Custom Dynamic
                'primary-hover': 'hsl(var(--primary-h) var(--primary-s) var(--primary-l-hover) / <alpha-value>)',
                'primary-active': 'hsl(var(--primary-h) var(--primary-s) var(--primary-l-active) / <alpha-value>)',
                secondary: '#334155', // Slate 700
                accent: '#FFD700', // Kuning Cendrawasih
                success: '#1B4D3E', // Hijau Rimba
                warning: '#FFD700', // Kuning Cendrawasih
                danger: '#9B2226', // Merah Pinang
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0', transform: 'translateY(10px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                }
            },
            animation: {
                'fade-in': 'fadeIn 0.3s ease-out forwards',
            }
        },
    },
    plugins: [],
}
