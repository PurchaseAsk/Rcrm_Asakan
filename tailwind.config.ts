import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Kanit", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#f3f7ff",
          100: "#e5edff",
          600: "#2563eb",
          700: "#1d4ed8",
          900: "#172554",
        },
      },
    },
  },
  plugins: [],
};

export default config;
