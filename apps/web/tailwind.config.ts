import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: "var(--brand-navy)",
          blue: "var(--brand-blue)",
          bright: "var(--brand-blue-bright)",
          red: "var(--brand-red)",
        },
        surface: "var(--surface)",
        bg: {
          page: "var(--bg-page)",
          tint: "var(--bg-tint)",
        },
        border: "var(--border)",
        text: {
          DEFAULT: "var(--text)",
          muted: "var(--text-muted)",
        },
        state: {
          ok: {
            bg: "var(--ok-bg)",
            fg: "var(--ok-fg)",
            line: "var(--ok-line)",
          },
          warn: {
            bg: "var(--warn-bg)",
            fg: "var(--warn-fg)",
            line: "var(--warn-line)",
          },
          bad: {
            bg: "var(--bad-bg)",
            fg: "var(--bad-fg)",
            line: "var(--bad-line)",
          },
          info: {
            bg: "var(--info-bg)",
            fg: "var(--info-fg)",
            line: "var(--info-line)",
          },
          none: {
            bg: "var(--none-bg)",
            fg: "var(--none-fg)",
            line: "var(--none-line)",
          },
          wait: {
            bg: "var(--wait-bg)",
            fg: "var(--wait-fg)",
            line: "var(--wait-line)",
          },
        },
        heat: {
          1: {
            bg: "var(--heat-1)",
            fg: "var(--heat-1-fg)",
          },
          2: {
            bg: "var(--heat-2)",
            fg: "var(--heat-2-fg)",
          },
          3: {
            bg: "var(--heat-3)",
            fg: "var(--heat-3-fg)",
          },
          4: {
            bg: "var(--heat-4)",
            fg: "var(--heat-4-fg)",
          },
        },
      },
      borderRadius: {
        card: "var(--radius-card)",
        control: "var(--radius-control)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
      },
    },
  },
  plugins: [],
};

export default config;
