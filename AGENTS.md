# AGENTS.md

Guia operacional para IAs (agentes de código e de notas) que trabalham neste
repositório ou no vault do MENTE.

## O que é o MENTE

App de notas **local-first** (segundo cérebro): árvore de categorias/notas,
editor rico TipTap com wikilinks `[[...]]`, busca, canvas visual e backup.
Stack: **React 18 + TypeScript (strict) + Vite + Dexie/IndexedDB + Zustand +
TipTap 3 + Tailwind v4**. Interface fixa em **pt-BR**. Sem backend: tudo no
navegador do usuário.

## Ambiente (obrigatório)

```bash
export PATH="$HOME/.local/node-v20.20.2-linux-x64/bin:$PATH"  # node 20 (o /usr/bin é v12)
```

- Instalação: `npm install --legacy-peer-deps`.
- Este diretório **não é um repositório git** (existe `.gitignore`, mas sem
  `git init`) — não há commits a fazer a menos que o usuário peça e inicialize.
- Playwright browsers em `$HOME/.cache/ms-playwright` (já instalados).

## Comandos essenciais

```bash
npm run dev          # servidor em http://localhost:5173
npm run test         # unitários (Vitest) — deve ficar verde sempre
npm run typecheck    # tsc -b
npm run lint         # eslint .
npm run build        # contraste + tsc + vite build
npm run e2e          # Playwright (usa o dev server em 5173 se já estiver no ar)
npm run mente -- help  # CLI do vault
```

**Antes de concluir qualquer tarefa de código**: rode `test`, `typecheck`,
`lint` (e `build` se tocou em build/styles).

## Regras de código

- **`src/domain/` é puro**: nada de React, Dexie, DOM ou `fetch`. Testável sem
  ambiente. `src/db/` não importa React.
- **Alias `@/` → `src/`** vale para `tsc`, Vite e Vitest — mas **`tsx`
  (scripts/) não resolve paths do tsconfig**: em `scripts/`, use imports
  relativos (`../src/domain/...`).
- **Textos visíveis** só via `t()` de `src/i18n/pt-BR.ts` (nunca hardcode em
  português no código de UI).
- **IDs são ULID**; ordem é `orderKey` (fractional indexing) — nunca ordene por
  timestamp ou índice numérico.
- **Derivados nunca persistem** (`childIds`, contagens, caminhos).
- **Proibido**: `console.log`, `TODO`, `localStorage` como storage principal,
  `innerHTML` com conteúdo do usuário, `any` explícito (ESLint bloqueia).
- **Estilo**: Prettier (semi, aspas simples, 100 colunas, vírgula final) +
  ESLint type-checked. Imports de tipo com `import type` inline.
- **Testes co-located** (`x.test.ts` ao lado de `x.ts`); factories em
  `src/tests/factories.ts`; testes de `db/` usam `fake-indexeddb`.
- Contraste WCAG AA é **teste** (`src/styles/contrast.test.ts`) e roda antes do
  build — cuidado ao mexer em cores/tokens.

## Arquitetura em 30 segundos

- Fluxo: **UI → stores Zustand → repositórios (`db/repositories/`) → Dexie ou
  backend em memória** (mesma interface `AppDatabase`).
- Banco `mente`: tabelas `notes`, `links`, `settings`, `views`, `meta`.
- Bootstrap (`db/bootstrap.ts`): migrações → seed de exemplo (1ª execução) →
  purga da lixeira (30 dias) → reparo de grafo → `storage.persist()`.
- Sincronização entre abas: BroadcastChannel `mente-database-sync-v1`.
- Backup JSON (`mente-backup` v1) é o formato full-fidelity; import é
  transação atômica com validação prévia (`domain/backup.ts` → `db/backup.ts`).
- Detalhes: `docs/ARCHITECTURE.md`; decisões: `docs/DECISIONS.md`.

## MENTE para IAs — operar as notas (vault)

O app tem um **vault Markdown**: um backup vira uma pasta de arquivos `.md`
editáveis por qualquer IA. O CLI (`scripts/mente.ts`) só usa `src/domain/`
(não toca no banco).

### Fluxo padrão

```bash
# 1) Exportar backup JSON no app (Configurações → Dados)

# 2) Preparar pasta Markdown acessível à IA
npm run mente -- ai:prepare --input backup.json --out ./mente-vault

# 3) Operar — editar os .md direto, ou via CLI:
npm run mente -- tree   --vault ./mente-vault
npm run mente -- search "assunto" --vault ./mente-vault
npm run mente -- read   --path caminho/nota.md --vault ./mente-vault
npm run mente -- create --parent "Categoria|raiz" --title "Título" \
              --tags a,b --body "markdown" --vault ./mente-vault

# 4) Merge de volta (vault → backup JSON, com LWW por nota)
npm run mente -- ai:package --vault ./mente-vault --out merged.json

# 5) Usuário revisa e importa merged.json no app (Configurações → Dados)
```

O agente no workspace pode ler e editar `mente-vault/`, mas não tem acesso
direto ao IndexedDB/perfil do navegador. A exportação inicial e a importação
de retorno são feitas no app. Exporte novamente antes de iniciar nova rodada;
`ai:prepare` atualiza os Markdown e a base local. `.mente/base.json` contém o
backup exportado e não deve ser publicado.

### Regras do vault (crítico)

1. **Preserve o frontmatter** de cada `.md`: `id`, `parentId`, `orderKey`,
   `title`, `tags`, `icon`, `color`, `createdAt`, `updatedAt`. Nunca troque o
   `id`. Se reescrever de forma mínima (só `id`), os campos ausentes são
   herdados do `--base` no carregamento.
2. **Hierarquia**: `parentId` no frontmatter manda; o caminho da pasta só vale
   quando `parentId` está ausente. Nota com filhos = `pasta/_index.md`.
   Para mover, atualize `parentId` (e/ou mova o arquivo).
3. **Wikilinks** no corpo: `[[Título exato]]` (resolvidos por título no merge).
4. **Merge nunca apaga** notas vivas ausentes da pasta. Apagar arquivo ≠ apagar
   nota (exclusão é no app).
5. **LWW**: em conflito de uma nota, vence `updatedAt` maior ou igual. Reexporte
   antes de editar; assim sua edição é a mais recente.
6. **`--base`** em todo comando que lê vault: herda campos de frontmatter
   mínimo e evita perda de tags/ícone/datas.
7. O **backup JSON** é a fonte de fidelidade (links, views, settings); o vault
   é a camada de edição. Guides embutidos: `.mente/AGENTES.md` (gerado no
   export) e `npm run mente -- help`.

### Código-fonte do fluxo

| Arquivo                  | Papel                                       |
| ------------------------ | ------------------------------------------- |
| `scripts/mente.ts`       | CLI (imports relativos; só `src/domain/`)   |
| `src/domain/markdown.ts` | codec nota ↔ Markdown (frontmatter + corpo) |
| `src/domain/vault.ts`    | export/load/merge/search/árvore do vault    |
| `src/domain/backup.ts`   | `parseBackup`/`createBackup` (validação)    |
| `src/domain/repair.ts`   | reparo de órfãos/ciclos                     |
| `src/db/backup.ts`       | import/export transacional no Dexie         |

Testes: `src/domain/markdown.test.ts`, `src/domain/vault.test.ts`,
`src/db/vaultWorkflow.test.ts` (fluxo completo até o Dexie),
`src/db/backup.test.ts`, `e2e/backup.spec.ts` (UI).

## Documentação

`README.md` (visão geral + fluxo IA) · `docs/ARCHITECTURE.md` ·
`docs/SHORTCUTS.md` · `docs/HANDOFF.md` (ambiente e handoff técnico) ·
`docs/PLAN.md` (fases/status) · `docs/DECISIONS.md` ·
`prompt-mestre-mente.md` (especificação-mestre).
