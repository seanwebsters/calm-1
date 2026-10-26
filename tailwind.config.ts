import type { Config } from "tailwindcss";

/**
 * Calm-1 design tokens. Soft off-white canvas, white surfaces, dark navy
 * ink and one restrained Calm-blue accent. Status colours are reserved for
 * state and always paired with an icon or label.
 */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F6F7F9",
        surface: { DEFAULT: "#FFFFFF", muted: "#FAFBFC", sunken: "#F1F3F6" },
        line: { DEFAULT: "#E6E9EF", strong: "#D5DAE3" },
        ink: { DEFAULT: "#0B1B3A", 2: "#33415C", 3: "#5E6B85", 4: "#8C97AC" },
        calm: { 50: "#F1F6FE", 100: "#E3EDFD", 200: "#C7DAFB", 400: "#5C8FEA", 500: "#2F6FDE", 600: "#235BC2", 700: "#1C4A9E" },
        series: { 1: "#2F6FDE", 2: "#0FA38A", 3: "#E0913A", 4: "#8A63D2" },
        good: { DEFAULT: "#16865C", soft: "#E8F6EF" },
        warn: { DEFAULT: "#B7791F", soft: "#FDF5E6" },
        bad: { DEFAULT: "#C93C3C", soft: "#FCEDED" },
      },
      fontFamily: {
        sans: ['"Inter Variable"', "Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      boxShadow: {
        card: "0 1px 2px rgba(11,27,58,0.04), 0 1px 1px rgba(11,27,58,0.02)",
        pop: "0 12px 32px -12px rgba(11,27,58,0.18), 0 2px 6px rgba(11,27,58,0.06)",
        focus: "0 0 0 3px rgba(47,111,222,0.18)",
      },
      borderRadius: { xl: "0.875rem", "2xl": "1.125rem" },
      letterSpacing: { tightish: "-0.011em", display: "-0.022em" },
    },
  },
  plugins: [],
} satisfies Config;
