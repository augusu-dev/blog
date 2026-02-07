import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        azuki: {
          50: "#fdf5f5",
          100: "#f5e0e0",
          200: "#e8bfbf",
          300: "#d49494",
          400: "#c07070",
          500: "#a85555",
          600: "#8b4040",
          700: "#6e3333",
          800: "#522626",
          900: "#3a1b1b",
        },
      },
      fontFamily: {
        sans: ['"Noto Sans JP"', "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
