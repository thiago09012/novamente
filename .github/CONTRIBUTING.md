# Contributing to Novamente

Thanks for considering a contribution! Novamente is a local-first second brain
(React + TypeScript + Vite + Dexie/IndexedDB + TipTap) with an AI-operable
Markdown vault and an MCP server. Small, well-tested slices merge fastest.

Please also read our [Code of Conduct](CODE_OF_CONDUCT.md) and the
[Security policy](SECURITY.md).

## Setup

Requirements: **Node.js 20+**.

```bash
npm install --legacy-peer-deps   # first time only
npm run dev                      # http://localhost:5173
```

Useful commands:

| Command                     | What it does                                              |
| --------------------------- | --------------------------------------------------------- |
| `npm run dev`               | Vite dev server (port 5173)                               |
| `npm run test`              | Unit tests (Vitest, must stay green)                      |
| `npm run typecheck`         | `tsc -b` (strict)                                         |
| `npm run lint`              | ESLint (type-checked)                                     |
| `npm run build`             | Contrast test + typecheck + production build into `dist/` |
| `npm run e2e`               | Playwright specs (needs the dev server on 5173)           |
| `npm run format`            | Prettier across the repo                                  |
| `npm run novamente`         | Markdown vault / second-brain CLI (`-- help`)             |
| `npm run mcp`               | Local MCP stdio server                                    |
| `npm run novamente:connect` | Interactive MCP client setup wizard                       |

## Ground rules (summary)

The full operator guide is [`AGENTS.md`](../AGENTS.md); the highlights:

- **`src/domain/` is pure**: no React, Dexie, DOM or `fetch`. `src/db/` never
  imports React.
- Path alias `@/` maps to `src/` for `tsc`, Vite and Vitest — but `tsx`
  scripts must use relative imports (`../src/domain/...`).
- **Visible UI text is pt-BR only**, through `t()` in `src/i18n/pt-BR.ts`
  (never hardcode user-facing strings).
- IDs are ULID; sibling order is `orderKey` (fractional indexing) — never sort
  by timestamp or numeric index. Derived data (`childIds`, counts, paths) is
  never persisted.
- No explicit `any` (blocked by ESLint), no `TODO`s, no `console.log` in app
  code, no `localStorage` as primary storage, no `innerHTML` with user content.
- Style: Prettier (semicolons, single quotes, 100 cols, trailing commas) +
  type-checked ESLint. Inline `import type`.
- Tests are co-located (`x.test.ts` next to `x.ts`); factories live in
  `src/tests/factories.ts`; `db/` tests use `fake-indexeddb`. Coverage
  thresholds hold at 80% for `src/domain/**` and `src/db/**`.
- WCAG AA contrast is a **test** (`src/styles/contrast.test.ts`) that runs
  before the build — be careful with colors and theme tokens.

## Pull request process

1. Open an issue first for anything beyond a trivial fix, so scope can be
   agreed before you code.
2. Keep PRs small and focused; one concern per PR.
3. Fill in `.github/pull_request_template.md` and keep every validation box
   green: `test`, `typecheck`, `lint` (plus `build` when touching build or
   styles).
4. Never commit secrets, tokens, private notes, backups or vault folders —
   double-check `git status` and the diff before pushing.
5. A maintainer reviews, may request changes, and merges. Pushing to `main`
   auto-deploys production on Vercel, so merges are deliberate.

## Good first issues

Look for the [`good first issue`](https://github.com/thiago09012/novamente/labels/good%20first%20issue)
and [`help wanted`](https://github.com/thiago09012/novamente/labels/help%20wanted)
labels. Docs, missing pt-BR strings, small CSS fixes and extra test coverage
are great starting points.

## License

By contributing you agree your work is released under the
[MIT License](../LICENSE).
