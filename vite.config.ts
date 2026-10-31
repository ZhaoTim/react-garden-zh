import mdx from "@mdx-js/rollup";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite-plus";
import { mdxOptions } from "./src/content/mdx/options.ts";

const generated = [
  "src/routeTree.gen.ts",
  ".output/**",
  "dist/**",
  "content/**",
  "public/attachments/**",
];

export default defineConfig({
  base: process.env.BASE_URL || "/",
  server: { port: 3000 },
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    // MDX must compile .md/.mdx to JSX before the React plugin sees it.
    { enforce: "pre", ...mdx(mdxOptions) },
    tanstackStart(),
    // Deploy target comes from NITRO_PRESET (default: node-server). Never hard-code `preset` here:
    // an explicit preset would override the env var. Nitro breaks Vitest (CJS react, shiki wasm), so skip it there.
    ...(process.env.VITEST ? [] : [nitro()]),
    viteReact({ include: /\.(mdx|md|js|jsx|ts|tsx)$/ }),
  ],
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: generated,
  },
  lint: {
    ignorePatterns: generated,
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
});
