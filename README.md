# MENTE

**Segundo cérebro local-first.** O MENTE organiza suas notas em uma
árvore navegável (categorias → notas → subnotas), com editor rico, wikilinks
`[[...]]`, busca instantânea e canvas visual. Funciona no navegador sem conta
ou conexão; você pode ativar uma conta Supabase opcional para guardar cópias.

- **Local-first**: os dados vivem no IndexedDB do seu navegador (ou em memória,
  se o armazenamento falhar). Opcionalmente, entre com uma conta Supabase e
  envie/restaure uma cópia privada pela seção de configurações.
- **Interface em português (pt-BR)**, tema escuro por padrão.
- **Feito para humanos e para IAs**: um vault Markdown versionável permite que
  uma IA edite suas notas com segurança (ver [MENTE para IAs](#mente-para-ias)).

## Recursos

- **Árvore de notas**: categorias na sidebar com contagem de descendentes,
  ícone, cor e renomeação inline; arrastar-e-soltar para reorganizar.
- **Canvas da categoria**: layout em árvore (d3-hierarchy) com pan/zoom,
  minimapa, seleção por caixa e multi seleção, foco no ramo, arestas de
  wikilinks e menu de contexto por nó (duplicar, mover para lixeira, etc.).
- **Editor rico (TipTap)**: negrito/listas/tabelas/task lists, comandos `/`,
  wikilinks `[[` com popup de sugestão, backlinks, tags editáveis, subnotas,
  ícone e cor da nota, autosave com debounce.
- **Busca** (`Ctrl/Cmd+K`): sem acentos, com fuzzy, boost de título/tags;
  modo comando `>` para ações rápidas.
- **Undo/redo estrutural** (limite 200), com desfazer agrupado em mutações em
  lote.
- **Lixeira** com retenção de 30 dias, restauração e exclusão definitiva.
- **Backup**: exportar/importar **JSON** (full-fidelity), **Markdown** e
  **OPML**, com validação e confirmação antes de substituir os dados.
- **Resiliência**: modo memória automático se a cota do navegador estourar,
  sincronização entre abas (BroadcastChannel), reparo automático de grafo
  (órfãos/ciclos) na abertura.
- **Publicação opcional**: Vercel para a interface estática e Supabase Auth +
  Postgres RLS para cópias manuais por conta. Veja [guia de publicação](docs/DEPLOYMENT.md).
- **Configurações**: tema (escuro/claro/sistema), densidade, escala de UI,
  movimento reduzido, arestas de wikilinks.

## Início rápido

```bash
# Node 20+ (neste ambiente o node do sistema é v12 — use o local):
export PATH="$HOME/.local/node-v20.20.2-linux-x64/bin:$PATH"

npm install --legacy-peer-deps   # só na primeira vez
npm run dev                      # http://localhost:5173
```

## Comandos

| Comando                 | O que faz                                                     |
| ----------------------- | ------------------------------------------------------------- |
| `npm run dev`           | Servidor de desenvolvimento (Vite, porta 5173)                |
| `npm run build`         | Teste de contraste + typecheck + build de produção em `dist/` |
| `npm run preview`       | Serve o `dist/` (porta 4173 no e2e)                           |
| `npm run test`          | Testes unitários (Vitest, co-located em `src/**/*.test.ts`)   |
| `npm run test:watch`    | Testes em modo watch                                          |
| `npm run test:contrast` | Só contraste WCAG AA (`src/styles`) — roda antes do build     |
| `npm run test:coverage` | Cobertura (thresholds 80% em `domain/` e `db/`)               |
| `npm run typecheck`     | `tsc -b` (strict)                                             |
| `npm run lint`          | ESLint (type-checked)                                         |
| `npm run format`        | Prettier em todo o repositório                                |
| `npm run e2e`           | Testes Playwright (`e2e/`, Chromium, pt-BR)                   |
| `npm run perf:stress`   | E2e de estresse (5.000 notas, build + preview)                |
| `npm run seed:stress`   | Gera seed JSON de N notas (não grava no banco)                |
| `npm run mente`         | CLI de vault/segundo cérebro (`npm run mente -- help`)        |

## MENTE para IAs

O MENTE expõe um **vault Markdown**: um backup vira uma pasta de arquivos `.md`
que uma IA pode ler e editar com qualquer ferramenta (agentes de código,
editores, scripts). As mudanças voltam para o app via **merge inteligente**.

### Fluxo completo

```bash
# 1) No app: Configurações → Dados → exporte o backup JSON

# 2) Preparar workspace local acessível à IA
npm run mente -- ai:prepare --input backup.json --out ./mente-vault

# 3) Ler/editar (a IA pode editar os .md direto, ou usar o CLI):
npm run mente -- tree   --vault ./mente-vault
npm run mente -- search "assunto" --vault ./mente-vault
npm run mente -- read   --path caminho/nota.md --vault ./mente-vault
npm run mente -- create --parent "Categoria" --title "Nova nota" \
              --tags ia,revisao --body "conteúdo" --vault ./mente-vault

# 4) Empacotar mudanças para revisão e importação
npm run mente -- ai:package --vault ./mente-vault --out merged.json

# 5) No app: Configurações → Dados → Importar arquivo → merged.json
```

O workspace inclui `.mente/AGENTES.md`, `.mente/manifest.json` e a base
`.mente/base.json`, usada para preservar configurações e visualizações. A pasta
`mente-vault/` é ignorada pelo Git para evitar publicar notas pessoais.

**Limite de acesso:** o app mantém os dados no IndexedDB do navegador. O agente
consegue operar a pasta do vault, mas não lê diretamente o perfil do browser.
A exportação inicial e cada importação continuam sendo feitas no app. Exporte
um backup novo e rode `ai:prepare` para atualizar o vault após mudanças feitas
no app.

### Regras do merge

- **Nunca apaga**: notas vivas que "sumiram" da pasta permanecem no resultado
  (apagar um arquivo **não** apaga a nota — exclusão é feita no app).
- **LWW por nota**: em conflito, vence quem tiver `updatedAt` maior ou igual.
  Reexporte o vault antes de editar para garantir que sua edição vença.
- **Herança com `--base`**: se o frontmatter for reescrito de forma mínima
  (só `id`), os campos ausentes (`tags`, `icon`, `color`, `orderKey`, datas)
  são herdados do backup original. Use `--base` em todos os comandos.
- **Reparo automático**: órfãos, ciclos e conteúdo inválido são normalizados
  no import; o app também repara na abertura.
- **Formato full-fidelity** continua sendo o **JSON** (`mente-backup` v1); o
  vault Markdown é a camada de edição. A conversão de Markdown não representa
  todos os recursos ricos do editor; mantenha o backup original.

### Frontmatter de uma nota

```markdown
---
id: 01J8ZK9...
parentId: 01J8ZK3... # null = categoria (nota raiz)
orderKey: a2 # posição entre irmãos (fractional indexing)
title: Minha nota
tags: [projeto, ia]
icon: circle
color: null
createdAt: 1791312000000
updatedAt: 1791312000000
---

Corpo livre em Markdown. Wikilink: [[Título exato]]. Tarefa: - [ ] a fazer.
```

Hierarquia: pastas espelham `parentId`; notas com filhos viram `pasta/_index.md`.
O pai verdadeiro é o `parentId` do frontmatter; o caminho da pasta vale só
quando `parentId` está ausente.

### Documentação do CLI

```bash
npm run mente -- help
```

Comandos: `ai:prepare`, `ai:package`, `vault:export`, `vault:import`, `search`, `read`, `tree`, `create`,
`move`, `tag`, `manifest`, `help`. Implementação: `scripts/mente.ts` (usa apenas
`src/domain/`), codec em `src/domain/markdown.ts`, grafo do vault em
`src/domain/vault.ts`.

## Arquitetura

```
UI (React)  →  stores (Zustand)  →  repositórios  →  Dexie/IndexedDB
                                                    ou backend em memória
Regras puras: src/domain/ (sem React, sem Dexie) — árvore, ordem, links,
              backup, codec markdown, vault, reparo
```

- **Camadas**: `domain/` puro · `db/` (Dexie, migrações, seed, sync) ·
  `features/` (sidebar, canvas, editor, busca, lixeira, configurações) ·
  `store/` (Zustand) · `app/` (bootstrap e layout) · `components/ui/`
  (primitivos) · `i18n/` (pt-BR) · `styles/` (tokens de tema).
- **Banco** `mente` (Dexie): `notes`, `links`, `settings`, `views`, `meta`.
  IDs ULID, ordem por fractional indexing (`orderKey`), lixeira com
  `deletedAt`/`deletedRootId`.
- **Sync entre abas**: BroadcastChannel `mente-database-sync-v1`.
- **Backup JSON** (`mente-backup` v1): `parseBackup` valida formato, schemas,
  referências e ciclos antes de qualquer gravação; o import é uma transação
  atômica (clear + bulkPut + reparo) e recarrega a página.

Mais detalhes: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Estrutura do projeto

```
src/
  app/           bootstrap, AppShell, runtime (Dexie ↔ memória)
  components/ui/ primitivos (Button, Dialog, Menu, Toast, Icon, ...)
  db/            Dexie, migrações, seed, backup, sync, reparo, repositórios
  domain/        regras puras (tree, order, links, backup, markdown, vault, ...)
  features/      sidebar, canvas, editor, search, trash, settings, help, pickers
  i18n/          pt-BR (t() tipado)
  store/         Zustand (notes, settings, view, ui)
  styles/        tokens de tema + global (Tailwind v4) + teste de contraste
  tests/         setup e factories dos testes
e2e/             12 specs Playwright (backup, tree, search, sync, axe, ...)
scripts/         mente.ts (CLI) e seed-stress.ts
docs/            ARCHITECTURE, SHORTCUTS, HANDOFF, PLAN, DECISIONS
```

## Testes

- **Unitários** (Vitest + Testing Library): co-located em `src/`,
  `fake-indexeddb` para camada `db/`. Hoje: **195 testes em 23 arquivos**.
- **Contraste** (77 asserções WCAG AA): roda como `prebuild` — build falha se
  o tema regredir.
- **E2e** (Playwright, Chromium, pt-BR): 12 specs cobrindo CRUD na árvore,
  busca, backup (JSON/MD/OPML), lixeira, sync entre abas, atalhos, drag,
  multi seleção, memória/ota e acessibilidade (axe).
- **Cobertura**: thresholds de 80% em `src/domain/**` e `src/db/**`.

## Atalhos principais

`Ctrl/Cmd+K` busca · `Ctrl/Cmd+N` nova nota · `Ctrl/Cmd+Shift+N` nova categoria ·
`Ctrl/Cmd+B` sidebar · `Ctrl/Cmd+\` editor · `Ctrl/Cmd+/` ajuda ·
`Ctrl/Cmd+Z` / `Shift+Z` desfazer/refazer · `F2` renomear · `Delete` lixeira.

Tabela completa: [`docs/SHORTCUTS.md`](docs/SHORTCUTS.md).

## Documentação

| Arquivo                                            | Conteúdo                               |
| -------------------------------------------------- | -------------------------------------- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)     | Arquitetura e modelo de dados          |
| [`docs/SHORTCUTS.md`](docs/SHORTCUTS.md)           | Todos os atalhos de teclado            |
| [`docs/HANDOFF.md`](docs/HANDOFF.md)               | Handoff técnico (ambiente, convenções) |
| [`docs/PLAN.md`](docs/PLAN.md)                     | Plano de fases e status                |
| [`docs/DECISIONS.md`](docs/DECISIONS.md)           | Registro de decisões técnicas          |
| [`prompt-mestre-mente.md`](prompt-mestre-mente.md) | Especificação-mestre do produto        |
| [`AGENTS.md`](AGENTS.md)                           | Guia operacional para IAs              |

## Status

Fases 1–5 concluídas; **Fase 6** (backup e resiliência) 🟡 — recursos prontos,
faltam testes unitários de cota/sync formal e auditoria axe ampliada;
**Fase 7** ⏳ — mobile, PWA/offline, onboarding e lista móvel.
Detalhes em [`docs/PLAN.md`](docs/PLAN.md).
