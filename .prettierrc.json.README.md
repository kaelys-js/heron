# .prettierrc.json

Prettier — **Svelte ONLY**. Biome handles every other file type (`.ts` / `.tsx` /
`.js` / `.mjs` / `.cjs` / `.json`). The plugin `prettier-plugin-svelte` teaches
prettier how to format `.svelte` files (script / style / template blocks).

Style settings mirror `biome.json` so `.ts` and `.svelte` feel identical:

- 2-space indent
- 100-column width
- Single quotes
- Trailing commas
- Always-parens arrow functions
- Brace spacing

Run:

- `pnpm format` — formats everything (biome + prettier)
- `pnpm format:check` — CI check
- `pnpm format:svelte` — only the prettier pass on `.svelte` files

Lefthook pre-commit auto-runs both formatters on staged files of the
appropriate types.
