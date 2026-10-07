# AGENTS.md

Guia operacional para IAs (agentes de código e de notas) que trabalham neste
repositório ou no vault do Neuronow.

## O que é o Neuronow

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
- Este checkout é um repositório Git. Confira `git branch --show-current` e
  `git status` antes de editar; preserve alterações locais preexistentes. Não
  faça commit ou push sem pedido explícito; push em `main` pode publicar na Vercel.
- Playwright browsers em `$HOME/.cache/ms-playwright` (já instalados).

## Comandos essenciais

```bash
npm run dev          # servidor em http://localhost:5173
npm run test         # unitários (Vitest) — deve ficar verde sempre
npm run typecheck    # tsc -b
npm run lint         # eslint .
npm run build        # contraste + tsc + vite build
npm run e2e          # Playwright (usa o dev server em 5173 se já estiver no ar)
npm run neuronow -- help  # CLI de contexto e vault; `mente` permanece como alias
npm run mcp          # servidor MCP stdio para clientes locais
npm run mente:connect  # assistente interativo de conexão MCP
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

## Neuronow para IAs — operar as notas (vault)

As notas para IA são arquivos Markdown compatíveis com Obsidian, com frontmatter,
IDs estáveis e wikilinks. O app pode sincronizar uma pasta escolhida pelo usuário;
o CLI (`scripts/mente.ts`) também prepara e processa vaults sem tocar no banco.

Para sessões Codex/MCP, leia [`docs/AI_PLAYBOOK.md`](docs/AI_PLAYBOOK.md). O
servidor `neuronow` opera em arquivos Markdown e backups JSON; ele não acessa o
IndexedDB do navegador. `mente_prepare` prepara o vault e `mente_package` gera o
JSON de retorno; a importação no app continua separada.

### Fluxo Markdown/Obsidian (preferido)

1. No app, Configurações → Dados → conecte uma pasta dedicada dentro do vault
   Obsidian e sincronize antes de trabalhar.
2. Trabalhe nos arquivos `.md` dessa pasta como notas do projeto. Preserve IDs e
   frontmatter; use `[[wikilinks]]` para conectar notas. Depois da sincronização,
   gravações feitas no app são escritas primeiro nos Markdown.
3. Ao concluir, sincronize a pasta no app para trazer as edições de volta e
   revisar conflitos. Divergências simultâneas ficam preservadas em
   `.mente/conflicts/`; notas ausentes não são apagadas automaticamente.

### Fluxo CLI (backup/importação)

```bash
# 1) Exportar backup JSON no app (Configurações → Dados)

# 2) Preparar pasta Markdown acessível à IA
npm run neuronow -- ai:prepare --input backup.json --out ./neuronow-vault --root "Projeto"
npm run neuronow -- ai:context "assunto" --vault ./neuronow-vault --budget 1800

# 3) Operar — editar os .md direto, ou via CLI:
npm run neuronow -- tree   --vault ./neuronow-vault
npm run neuronow -- search "assunto" --vault ./neuronow-vault
npm run neuronow -- read   --path caminho/nota.md --vault ./neuronow-vault
npm run neuronow -- create --parent "Projeto|raiz" --title "Título" \
                  --tags a,b --body "markdown" --vault ./neuronow-vault

# 4) Merge de volta (vault → backup JSON, com LWW por nota)
npm run neuronow -- ai:package --vault ./neuronow-vault --base backup-atual.json --root "Projeto" --out neuronow-merged.json

# 5) Revise .mente/review.md e importe merged.json no app (Configurações → Dados)
```

O agente no workspace pode ler e editar `neuronow-vault/`, mas não tem acesso
direto ao IndexedDB/perfil do navegador. A exportação inicial e a importação
de retorno são feitas no app. Exporte novamente antes de iniciar nova rodada;
`ai:prepare` atualiza os Markdown e a base local. `.mente/base.json` contém o
backup exportado e não deve ser publicado.

Para não perder o estado entre sessões, mantenha uma nota filha `Resumo do
projeto` com objetivo, estado atual, decisões, pendências, riscos e próximo
passo. Leia e atualize essa nota no início e no fim de cada rodada. O parâmetro
`ai:context --budget N` limita o contexto por uma estimativa de caracteres,
não por tokenizer exato.

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
6. Em vault completo, `--base` herda campos de frontmatter mínimo. Em vault
   limitado por `--root`, leitura e edição usam a base restrita local; somente
   `ai:package` recebe o backup completo atualizado em `--base` e exige o mesmo
   `--root` para rejeitar mudanças fora do projeto.
7. O **backup JSON** é a fonte de fidelidade (links, views, settings); o vault
   é a camada de edição. Guides embutidos: `.mente/AGENTES.md` (gerado no
   export) e `npm run neuronow -- help`.

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

`README.md` (visão geral + fluxo IA) · `docs/AI_PLAYBOOK.md` (handoff detalhado
para agentes/MCP) · `docs/ARCHITECTURE.md` ·
`docs/SHORTCUTS.md` · `docs/HANDOFF.md` (ambiente e handoff técnico) ·
`docs/PLAN.md` (fases/status) · `docs/DECISIONS.md` ·
`prompt-mestre-mente.md` (especificação-mestre).
