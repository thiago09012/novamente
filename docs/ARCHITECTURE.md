# ARCHITECTURE — arquitetura, desempenho e testes

_Atualizado em 06/10/2026 (Fases 2–4)._ 

## Camadas

```
src/
  app/         bootstrap (App, AppShell), runtime (handle do banco), ErrorBoundary global
  components/  primitivos de UI: Icon+icons.ts, Button, Dialog, Menu, Tooltip, ToastHost, Skeleton
  domain/      regras puras (sem React, sem Dexie): tree, order, links, restore, duplicate,
               content, tags, settings, constants, types
  db/          Dexie (schema v1), migrações versionadas, repositórios (interface + Dexie),
               seed de exemplo, bootstrap (abre, migra, semeia, persist())
  features/    sidebar, canvas SVG+HTML (d3-hierarchy, pan/zoom, culling, CRUD), editor,
               busca (MiniSearch), trash, settings, help, pickers
  store/       Zustand: notesStore, settingsStore, uiStore, viewStore
  i18n/        dicionário pt-BR + t() tipado com parâmetros {chave}
  styles/      tokens.css (temas), global.css (Tailwind v4 + estados), contrast.test.ts
  tests/       setup (cleanup RTL) + factories
```

Regras de dependência: `domain/` não importa React nem Dexie; `db/` não importa React;
`features/` e `app/` compõem tudo. Textos visíveis só via `i18n`.

## Fluxo de dados

```
UI (features/, components/)
  → ações do store (zustand)           // cópias rasas + revert em falha
    → repositórios (interfaces em db/repositories/types.ts)
      → Dexie/IndexedDB (transações)
  ← estado derivações: byId → childIds (reindexChildren) recalculado em memória
```

- **Nada derivado é persistido** (contagens, caminhos, `childIds`).
- **Princípio tree-first:** toda feature nova mora na árvore — `parentId` + `orderKey` (fractional indexing), categorias são raízes (`parentId: null`), ordem sempre por `orderKey`. Ler/escrever via `src/domain/tree.ts` e `src/domain/order.ts`; IDs ULID. Ver decisão permanente em `docs/DECISIONS.md` §10.
- Escritas otimistas com rollback em erro e toast "Não foi possível salvar. Tente de novo."
- Preferências (`Settings`) e notas (`Note`) vivem em tabelas separadas.

## Banco (Dexie, schema v1)

| Tabela | Índices |
|---|---|
| `notes` | `id`, `parentId`, `[parentId+orderKey]`, `deletedAt`, `updatedAt`, `*tags` |
| `links` | `id`, `fromId`, `toId` |
| `settings` | `key` (linha única `app`) |
| `views` | `rootId` (estado de canvas por categoria — Fase 2) |
| `meta` | `key` (seed, migrações) |

Migrações: `applyDataMigrations` versionadas, idempotentes, com teste.
Seed de exemplo: 17 notas, 3 categorias (Comida, Bebidas, Livros), marcadas em `meta.exampleRootIds`.

## Tema, densidade e movimento

- `<html data-theme>` + `<html data-motion>` + `--ui-scale`, `--node-height`, `--node-font-size`
  aplicados por `applySettingsToDom` (fonte única da aparência).
- Tokens em `styles/tokens.css` (escuro em `:root`, claro em `[data-theme='light']`).
- **Teste de contraste AA quebra o build** (`prebuild` → `test:contrast`, 75 asserções).

## Metas de desempenho (seção 14)

| Métrica | Meta | Status |
|---|---|---|
| JS do entry gzip | < 250 kB | ⚠️ 143,72 kB após busca, comandos e arestas; o chunk do editor (170,28 kB) também carrega no início porque o painel abre por padrão; total aproximado 314 kB, acima da meta |
| Carga inicial | < 1 s | ⏳ ainda não medida |
| 5.000 notas: abrir categoria | < 200 ms | ✅ 179,4 ms na última amostra (quatro execuções recentes: 141,2–185,6 ms; todas abaixo da meta; build de produção, Chromium 153, 1280×720; tarefa longa de 77 ms; layout 8,6 ms) |
| 5.000 notas: busca | < 50 ms | ✅ MiniSearch: 11 ms e 16,5 ms em duas consultas amplas; construção do índice 47,5–48,7 ms |
| Pan com 5.000 notas | 60 fps | ✅ 60,7 fps / 16,46 ms por frame na última amostra (faixa recente 60,1–60,8 fps); canvas manteve 23 nós montados por culling |
| Digitação | sem atraso perceptível | ⏳ precisa medir com instrumentação de interação |

## Testes

| Camada | Ferramenta | Estado |
|---|---|---|
| Domínio + db + contraste + layout + stores | Vitest | ✅ 165 testes / 18 arquivos |
| Componentes (App/sidebar/editor/canvas layout) | Vitest + Testing Library (jsdom) | ✅ 5 testes de UI/layout |
| Smoke em navegador (ad-hoc, Playwright) | Chromium real | ✅ carga, CRUD, tema, reload, lixeira — 0 erros |
| E2E | Playwright | ✅ 16 fluxos funcionais, com banco limpo por teste; stress de 5.000 notas roda isolado (`npm run e2e`, `npm run perf:stress`) |
| Cobertura `domain/` e `db/` (mín. 80%) | `npm run test:coverage` | ✅ 97% stmts domain, 95% db |
| `axe` | Fase 6 | ⏳ |

## Comandos

```bash
npm install --legacy-peer-deps   # uma vez (ambiente Node 20)
npm run dev                      # http://localhost:5173
npm run lint                     # eslint .
npm run typecheck                # tsc -b
npm run test                     # vitest run
npm run test:coverage            # com cobertura + thresholds
npm run test:contrast            # só tokens (também roda no prebuild)
npm run build                    # test:contrast + tsc + vite build
npm run e2e                      # playwright (a partir da Fase 2)
npm run seed:stress              # gera e resume seed de 5.000 notas; não grava no banco
npm run perf:stress              # build de produção + medição reprodutível com 5.000 notas
```

## Limitações conhecidas (Fase 2)

- A lista de subnotas pagina em grupos de 40; o nível largo recolhido usa caminho linear.
- Bundle TipTap está separado do entry, mas carrega no início porque o editor abre por padrão; atingir a meta de JS inicial exige adiar a inicialização do editor rico.
- No Chromium headless deste ambiente, quatro aberturas recentes variaram entre 141,2–185,6 ms, todas abaixo do limite adotado de 200 ms; pan varia entre 60,1–60,8 fps. Um perfil CDP apontou reconciliação React (~74 ms inclusivos) e publicação de âncora do `Sidebar` (~12 ms); `buildLayout` ficou perto de 5–9 ms. O store de settings evita publicar novamente estado idêntico e protege updates otimistas concorrentes. O minimapa resume os nós em um único path SVG. Repetir em hardware de referência antes de atribuir toda a variação ao código.
- Busca MiniSearch em memória; grupos vencidos da lixeira são purgados no bootstrap junto com links e views; arestas de wikilinks são uma camada SVG opcional persistida nas configurações. Histórico estrutural cobre criação, renomeação, movimento/reordenação, lixeira/restauração, estilo, tags e duplicação, mas não persiste após recarga. Seleção por caixa, touch e auto-pan ainda pendem na Fase 4; foco no ramo e minimapa ainda pendem na Fase 5.
- Erro de armazenamento mostra tela + retry; modo somente memória na Fase 6.
- Mobile em andamento: retrato usa lista de árvore e editor em bottom sheet; paisagem usa o canvas e editor lateral; categorias abrem em drawer. O layout reutiliza os stores desktop. PWA/service worker e onboarding ainda pendem da Fase 7.
