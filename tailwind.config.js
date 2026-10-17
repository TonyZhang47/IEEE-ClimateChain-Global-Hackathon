/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        abyss: "#071116",
        deep: "#0c1c24",
        foam: "#e7f4f1",
        mist: "#9db4b0",
        aqua: "#3ddec0",
        amber: "#e7a15a",
        coral: "#ef6f6f",
        line: "rgba(168, 230, 214, 0.16)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glass: "0 24px 60px rgba(0, 0, 0, 0.32)",
      },
    },
  },
  plugins: [],
};
