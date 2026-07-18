/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"]
      },
      colors: {
        brand: {
          DEFAULT: "#0a84ff",
          dark: "#0071e3"
        },
        sidebar: {
          bg: "#1d1d1f",
          muted: "#636366",
          subtle: "#3a3a3c",
          text: "#a1a1a6",
          active: "#f5f5f7"
        },
        surface: {
          DEFAULT: "#f5f5f7",
          card: "#ffffff"
        }
      },
      borderRadius: {
        card: "16px",
        pill: "9999px"
      },
      maxWidth: {
        content: "1600px",
        contentWide: "1920px"
      }
    }
  },
  plugins: []
};
