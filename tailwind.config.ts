import type { Config } from "tailwindcss";

/**
 * Tailwind config — consumes CSS custom properties from globals.css
 *
 * Colors are mapped to CSS vars so they respond to theme changes
 * (data-theme="light" / data-theme="dark") without recompiling.
 */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        /* Brand scale — mapped to CSS vars */
        brand: {
          50:  "var(--brand-50)",
          100: "var(--brand-100)",
          200: "var(--brand-200)",
          300: "var(--brand-300)",
          400: "var(--brand-400)",
          500: "var(--brand-500)",
          600: "var(--brand-600)",
          700: "var(--brand-700)",
          800: "var(--brand-800)",
          900: "var(--brand-900)",
        },
        /* Backward compat — flat keys */
        "brand-500": "var(--brand-500)",
        "brand-600": "var(--brand-600)",
        "brand-700": "var(--brand-700)",
        /* Coal scale */
        coal: {
          950: "var(--coal-950)",
          900: "var(--coal-900)",
          800: "var(--coal-800)",
          700: "var(--coal-700)",
          600: "var(--coal-600)",
          500: "var(--coal-500)",
          400: "var(--coal-400)",
          300: "var(--coal-300)",
          200: "var(--coal-200)",
          100: "var(--coal-100)",
        },
        /* Semantic — theme-aware */
        bg:        "var(--bg)",
        surface:   "var(--surface)",
        "surface-2": "var(--surface-2)",
        "surface-3": "var(--surface-3)",
        "surface-4": "var(--surface-4)",
        border:    "var(--border)",
        "border-2": "var(--border-2)",
        "border-3": "var(--border-3)",
        text:      "var(--text)",
        "text-2":  "var(--text-2)",
        "text-3":  "var(--text-3)",
        accent:    "var(--accent)",
        "accent-2": "var(--accent-2)",
        "accent-dim": "var(--accent-dim)",
        /* Status */
        success: "var(--success)",
        warning: "var(--warning)",
        error:   "var(--error)",
        /* Pastels */
        "pastel-blue":   "var(--pastel-blue)",
        "pastel-purple": "var(--pastel-purple)",
        "pastel-amber":  "var(--pastel-amber)",
        "pastel-green":  "var(--pastel-green)",
        "pastel-rose":   "var(--pastel-rose)",
      },
      borderRadius: {
        xs:   "var(--r-xs)",
        sm:   "var(--r-sm)",
        md:   "var(--r-md)",
        lg:   "var(--r-lg)",
        xl:   "var(--r-xl)",
        "2xl": "var(--r-2xl)",
        full: "var(--r-full)",
      },
      boxShadow: {
        xs:   "var(--shadow-xs)",
        sm:   "var(--shadow-sm)",
        md:   "var(--shadow-md)",
        lg:   "var(--shadow-lg)",
        glow: "var(--shadow-glow)",
      },
    },
  },
  plugins: [],
};
export default config;
