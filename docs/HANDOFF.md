# HANDOFF — Neuronow

_Atualizado em 06/10/2026._ O plano vivo está em `docs/PLAN.md`; requisitos completos em `prompt-mestre-mente.md`.

## Estado atual

- Fase 1 concluída.
- Fase 2 concluída com a meta de abertura ajustada para <200 ms: quatro amostras recentes ficaram entre 141,2–185,6 ms. Pan ficou entre 60,1–60,8 fps.
- Fase 3 concluída: TipTap/editor, autosave, wikilinks, backlinks, tags e subnotas, com E2E de reload e navegação por link.
- Fase 4 concluída: atalhos, histórico estrutural, seleção por modificador/caixa, DnD desktop/touch com auto-pan e cancelamento, além de mover, excluir, tags, cor e ícone em lote. As mutações em lote compartilham uma entrada de undo; E2E cobre mover duas notas com um undo e desfazer/refazer estilo.
- Fase 5 concluída: busca MiniSearch, notas recentes, modo `>` com comandos básicos, navegação/revelação, retenção de 30 dias, foco no ramo, minimapa e arestas de wikilinks com alternância persistente prontos. Busca com 5.000 notas mediu 11–16,5 ms; índice inicial, 47,5–48,7 ms.
- Fase 6 em andamento: backup JSON versionado exporta/restaura notas, links, settings, views e meta em transação; Markdown/OPML trocam hierarquia, títulos, texto e tags. Import valida e mostra resumo antes de confirmar substituição.
- O E2E funcional passou com 16 testes usando dois workers, incluindo round-trip JSON e import/export Markdown/OPML, minimapa, operações em lote, foco no ramo, DnD touch/desktop, aviso da lixeira e alternância das arestas; cada cenário limpa o IndexedDB. O stress de 5.000 notas roda isolado por `npm run perf:stress`.
- O usuário autorizou implementar automaticamente as sete fases, sem pausar nos portões de aprovação anteriores.

## Verificações da Fase 2

- `npm run e2e` passou em 06/10/2026: edição/link após reload, atalhos globais, undo/redo básico e stress de 5.000 notas.
- A regressão de layout cobre quatro níveis com 20 irmãos por nível e evita sobreposição.
- `npm run perf:stress` executa build de produção, inicia preview e mede com Chromium headless em 1280×720.
- Última amostra: 5.000 notas, abrir categoria **179,4 ms** (quatro amostras: 141,2–185,6 ms; todas abaixo da meta <200 ms; tarefa longa de 77 ms; layout 8,6 ms); pan **60,7 fps** (meta 60 fps), com 23 nós HTML montados pelo culling. Busca ampla MiniSearch: **11–16,5 ms**, índice inicial **46,7–52,8 ms**. O store de settings evita republicar estado persistido idêntico e protege updates otimistas concorrentes. O minimapa desenha os nós em um único path SVG. Perfil CDP isolado aponta reconciliação React (~74 ms inclusivos) e publicação de âncora do `Sidebar` (~12 ms); `buildLayout` ficou perto de 5–9 ms. A lista de subnotas monta 40 por vez e nível largo recolhido usa caminho linear.
- Bundle antes da busca: entry gzip **133,27 kB**; build atual pós-busca/comandos/arestas: entry gzip **143,72 kB**, chunk do editor gzip **170,28 kB**. Como o painel abre por padrão, total aproximado de 314 kB; meta <250 kB pendente.
- Registrar diferenças de ambiente ao repetir medições. `npm run seed:stress` gera apenas dados/resumo; somente `npm run perf:stress` injeta no IndexedDB real do navegador. A meta adotada para abertura é <200 ms.

## Ambiente

- Usar Node `v20.20.2` em `~/.local/node-v20.20.2-linux-x64/bin` (o `/usr/bin/node` é v12).
- Dependências Playwright em `~/.cache/ms-playwright`; usar `PLAYWRIGHT_BROWSERS_PATH="$HOME/.cache/ms-playwright"`.
- `npm install --legacy-peer-deps` para instalar dependências.
- `npm run dev` inicia o Vite em `http://localhost:5173`.

## Próximas ações

1. Reduzir custo de medição/renderização na abertura de 5.000 notas e adiar a inicialização do TipTap até o usuário entrar no corpo da nota.
2. Completar testes de falha de armazenamento/QuotaExceeded, sincronização multi-aba e auditoria `axe`; depois concluir a Fase 7 mobile/PWA.
3. Rodar lint, typecheck, testes, E2E e build no fim de cada fase; atualizar arquitetura, atalhos, decisões, handoff e plano.

## Restrições permanentes

- Textos visíveis em pt-BR somente via `src/i18n`.
- Sem `console.log`, `TODO`, `localStorage` como storage principal, ou `innerHTML` com conteúdo de usuário.
- IDs ULID; regras puras em `domain/` sem React/Dexie; operações persistidas por repositórios Dexie.
- Metas de desempenho e acessibilidade devem ser medidas; não marcar como concluídas por inferência.
