# Neuronow

[![CI](https://github.com/thiago09012/novamente/actions/workflows/ci.yml/badge.svg)](https://github.com/thiago09012/novamente/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Live demo](https://img.shields.io/badge/demo-live-brightgreen)](https://novamente-smoky.vercel.app)

_English version: [README.md](README.md) · [Demonstração ao vivo](https://novamente-smoky.vercel.app)_

**Notas de projetos local-first, prontas para trabalhar com IA.** O Neuronow organiza suas notas em uma
árvore navegável (categorias → notas → subnotas), com editor rico, wikilinks
`[[...]]`, busca instantânea e canvas visual. Funciona no navegador sem conta
ou conexão; você pode ativar uma conta Supabase opcional para guardar cópias.

- **Local-first**: os dados vivem no IndexedDB do seu navegador (ou em memória,
  se o armazenamento falhar). Opcionalmente, entre com uma conta Supabase e
  envie/restaure uma cópia privada pela seção de configurações.
- **Interface em português (pt-BR)**, tema escuro por padrão.
- **Feito para humanos e para IAs**: exporte contexto de um projeto, busque
  notas conectadas e revise as mudanças sugeridas pela IA — ou dê acesso direto
  a um agente pelo **servidor MCP** (ver [Neuronow para IAs](#neuronow-para-ias)).

![Canvas com arestas de wikilinks entre notas](docs/images/canvas.png)
![Editor com títulos e chips clicáveis de wikilink](docs/images/editor.png)

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
- **Contexto para IA**: exporte a categoria ativa e suas notas-filhas em
  Markdown com IDs, caminhos, tags e links, sem alterar a base local.
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

Requisito: **Node.js 20+**.

```bash
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
| `npm run e2e`           | Testes Playwright (`e2e/`, Chromium)                          |
| `npm run perf:stress`   | E2e de estresse (5.000 notas, build + preview)                |
| `npm run seed:stress`   | Gera seed JSON de N notas (não grava no banco)                |
| `npm run neuronow`      | CLI de contexto e vault para IA (`npm run neuronow -- help`)  |
| `npm run mente`         | Alias compatível da CLI antiga                                |
| `npm run mcp`           | Servidor MCP stdio local                                      |
| `npm run mente:connect` | Assistente interativo de conexão MCP                          |

## Neuronow para IAs

O Neuronow expõe um **vault Markdown**: um backup vira uma pasta de arquivos `.md`
que uma IA pode ler e editar com qualquer ferramenta (agentes de código,
editores, scripts). As mudanças voltam para o app via **merge inteligente**.

### Fluxo Obsidian recomendado

1. Em Configurações → Dados, conecte uma pasta dedicada dentro do vault do
   Obsidian e sincronize no começo da sessão.
2. Edite os `.md` dessa pasta com o Obsidian ou com a IA. As notas usam
   frontmatter com IDs estáveis e `[[wikilinks]]`. Depois da sincronização, as
   alterações feitas no app são gravadas primeiro nos arquivos Markdown.
3. Após a IA editar os arquivos, sincronize novamente no app. Ele importa as
   mudanças, grava a versão consolidada e cria `.mente/review.md`; versões
   divergentes ficam preservadas em `.mente/conflicts/`.
4. Mantenha uma nota filha `Resumo do projeto` para objetivo, estado, decisões,
   pendências, riscos e próximo passo.

### Servidor MCP (acesso direto do agente)

O `scripts/mcp-server.ts` fala MCP via stdio com 8 tools (`mente_tree`,
`mente_search`, `mente_read`, `mente_create`, `mente_move`, `mente_tag`,
`mente_prepare`, `mente_package`) operando sobre a pasta do vault. Registre
em qualquer cliente MCP:

```bash
npm run mente:connect -- --ide cursor --scope global --dry-run  # prévia primeiro
```

Clientes suportados: Antigravity, Cursor, VS Code, Claude Desktop, Windsurf,
opencode, além de comando pronto para Claude Code. O servidor relê os arquivos
a cada chamada e nunca acessa o IndexedDB do navegador — exportar/importar no
app continua sendo o vai-e-volta. Handoff completo para agentes:
[`docs/AI_PLAYBOOK.md`](docs/AI_PLAYBOOK.md).

### Fluxo CLI alternativo (backup JSON)

```bash
# 1) No app: Configurações → Dados → exporte o backup JSON

# 2) Prepare somente o projeto que a IA vai trabalhar
npm run neuronow -- ai:prepare --input backup.json --out ./neuronow-vault --root "Projeto X"

# 3) Busque fatos relevantes com orçamento aproximado de tokens
npm run neuronow -- ai:context "prazo e próximos passos" --vault ./neuronow-vault --budget 1800

# 4) A IA pode ler/editar .md ou usar os comandos de vault
npm run neuronow -- tree --vault ./neuronow-vault
npm run neuronow -- read --path caminho/nota.md --vault ./neuronow-vault
npm run neuronow -- create --parent "Projeto X" --title "Nova nota" \
                   --tags ia,revisao --body "conteúdo" --vault ./neuronow-vault

# 5) Exporte um backup atualizado e empacote com revisão de escopo
npm run neuronow -- ai:package --vault ./neuronow-vault --base backup-atual.json \
                   --root "Projeto X" --out neuronow-merged.json

# 6) Revise .mente/review.md e importe o JSON no app
```

O app também oferece **Exportar contexto do projeto ativo para IA** em
Configurações → Dados. Esse Markdown inclui apenas a categoria ativa e suas
descendentes, com IDs e caminhos para a IA citar suas fontes.

O vault limitado inclui `.mente/AGENTES.md`, `.mente/manifest.json` e um
`.mente/base.json` contendo somente o projeto selecionado. Ao empacotar, passe
um backup completo atualizado em `--base`; o CLI preserva as demais notas e
rejeita mudanças que saiam do projeto. O relatório fica em `.mente/review.md`.
As pastas `mente-vault/` e `neuronow-vault/` são ignoradas pelo Git para evitar
publicar anotações pessoais.

O IndexedDB continua sendo o cache local usado pela interface; após sincronizar,
as gravações do app passam primeiro pelos arquivos Markdown. Sincronize após
edições externas da IA/Obsidian e no início de cada sessão. O navegador pode
pedir autorização da pasta novamente. Apagar um arquivo `.md` não exclui uma
nota; exclusões são feitas no app para evitar remoção acidental de dados.

**Memória de projeto para cada sessão:** mantenha uma nota filha chamada
`Resumo do projeto` dentro da categoria. Escreva nela objetivo, estado atual,
decisões, pendências, riscos e próximo passo. `ai:context` inclui essa nota
primeiro e reduz os trechos seguintes para caber no `--budget` aproximado
(estimativa de caracteres, não um tokenizer exato). Se o resumo não existir,
usa a nota da categoria como âncora. Em backups com mais de um projeto, passe
`--root` para evitar buscar no projeto errado.

### Regras do merge

- **Nunca apaga**: notas vivas que "sumiram" da pasta permanecem no resultado
  (apagar um arquivo **não** apaga a nota — exclusão é feita no app).
- **LWW por nota**: em conflito, vence quem tiver `updatedAt` maior ou igual.
  Reexporte o vault antes de editar para garantir que sua edição vença.
- **Herança com `.mente/base.json`**: se o frontmatter for reescrito de forma mínima
  (só `id`), os campos ausentes (`tags`, `icon`, `color`, `orderKey`, datas)
  são herdados do snapshot usado para preparar o vault. No `ai:package`, `--base`
  pode apontar para o backup completo mais recente para detectar conflitos.
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
npm run neuronow -- help
```

Comandos: `ai:prepare`, `ai:context`, `ai:package`, `vault:export`,
`vault:import`, `search`, `read`, `tree`, `create`, `move`, `tag`,
`manifest`, `help`. Implementação: `scripts/mente.ts` (usa apenas
`src/domain/`), codec em `src/domain/markdown.ts`, grafo do vault em
`src/domain/vault.ts`, servidor MCP em `scripts/mcp-server.ts`.

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
  mcp/           definições de clientes MCP para o assistente de conexão
  store/         Zustand (notes, settings, view, ui)
  styles/        tokens de tema + global (Tailwind v4) + teste de contraste
  tests/         setup e factories dos testes
e2e/             13 specs Playwright (backup, tree, search, sync, axe, ...)
scripts/         mente.ts (CLI), mcp-server.ts (MCP), mente-connect.ts (setup), seed-stress.ts
docs/            ARCHITECTURE, SHORTCUTS, HANDOFF, PLAN, DECISIONS, AI_PLAYBOOK
```

## Testes

- **Unitários** (Vitest + Testing Library): co-located em `src/`,
  `fake-indexeddb` para camada `db/`. Hoje: **205 testes em 25 arquivos**.
- **Contraste** (77 asserções WCAG AA): roda como `prebuild` — build falha se
  o tema regredir.
- **E2e** (Playwright, Chromium, pt-BR): 13 specs cobrindo CRUD na árvore,
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
| [`docs/AI_PLAYBOOK.md`](docs/AI_PLAYBOOK.md)       | Handoff detalhado para agentes e MCP   |
| [`docs/SHORTCUTS.md`](docs/SHORTCUTS.md)           | Todos os atalhos de teclado            |
| [`docs/HANDOFF.md`](docs/HANDOFF.md)               | Handoff técnico (ambiente, convenções) |
| [`docs/PLAN.md`](docs/PLAN.md)                     | Plano de fases e status                |
| [`docs/DECISIONS.md`](docs/DECISIONS.md)           | Registro de decisões técnicas          |
| [`prompt-mestre-mente.md`](prompt-mestre-mente.md) | Especificação original do produto      |
| [`AGENTS.md`](AGENTS.md)                           | Guia operacional para IAs              |

## Status

Fases 1–5 concluídas; **Fase 6** (backup e resiliência) 🟡 — recursos prontos,
faltam testes unitários de cota/sync formal e auditoria axe ampliada;
**Fase 7** ⏳ — mobile, PWA/offline, onboarding e lista móvel. Detalhes em
[`docs/PLAN.md`](docs/PLAN.md).

## Contribuindo

Contribuições são bem-vindas! Leia [`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md)
(em inglês), o [Código de Conduta](.github/CODE_OF_CONDUCT.md) e abra uma issue
antes de mudanças grandes. Boas primeiras issues têm o selo
[`good first issue`](https://github.com/thiago09012/novamente/labels/good%20first%20issue).

## Licença

[MIT](LICENSE) © 2026 Thiago (thiago09012).
