# Plano de evolução do Novamente

Este plano segue as sete fases e critérios de aceite de `prompt-mestre-novamente.md`. A instrução do usuário em 06/10/2026 autoriza avançar automaticamente entre fases, sem interromper nos portões de aprovação descritos no prompt. Cada fase ainda deve terminar com verificações, atualização de documentação e registro de pendências.

## Estado e sequência

| Fase | Escopo | Critério de conclusão | Estado |
|---|---|---|---|
| 1. Fundação | Stack, domínio, IndexedDB, shell, sidebar, configurações | Persistência de categorias e qualidade verde | ✅ concluída |
| 2. Árvore | Layout d3, canvas, CRUD, teclado ARIA, pan/zoom e culling | Árvore larga sem colisão; CRUD persiste; abrir <200 ms e navegação fluida com 5.000 notas | ✅ quatro amostras recentes entre 141,2–185,6 ms, todas abaixo de 200 ms; pan ≥60 fps |
| 3. Editor e links | TipTap, autosave, breadcrumbs, wikilinks, backlinks, tags e subnotas | Link entre categorias, título atualizado em todos os lugares e texto preservado ao fechar | ✅ implementada; Vitest, lint, typecheck e E2E verdes |
| 4. Teclado, arrastar e histórico | Atalhos globais, DnD com auto-pan, seleção múltipla, undo/redo em lote | Criação por teclado e reversão estrutural em um passo | ✅ seleção por modificador e caixa; DnD desktop/touch com auto-pan e cancelamento; mover, excluir, tags, cor e ícone em lote; undo/redo agrupado cobertos por E2E |
| 5. Busca e navegação | MiniSearch/Ctrl+K, TTL da lixeira, foco no ramo, minimapa, arestas de links | Busca sem acento; restauração inteligente; alternância das arestas | ✅ busca, recentes, comandos, navegação, TTL, foco no ramo, minimapa e arestas implementados; busca em 5.000 notas: 11–16,5 ms |
| 6. Dados e robustez | Import/export JSON/Markdown/OPML, falhas, multi-aba, ARIA/axe, tema claro | Round-trip integral e falhas simuladas sem crash; sem violações críticas | 🟡 Import/export dos três formatos implementado; faltam falhas QuotaExceeded/IDB indisponível, sync multi-aba e auditoria axe |
| 7. Mobile e entrega | Lista móvel, drawer, bottom sheet, gestos, PWA offline, onboarding e README | Fluxo mobile E2E; app offline; auditoria Lighthouse conforme meta do prompt | 🟡 Lista retrato, canvas paisagem, drawer e editor sheet/lateral implementados; PWA e entrega pendentes |

## Execução

1. Fase 2 concluída sob a meta ajustada para <200 ms: quatro amostras recentes passaram; pan permanece acima de 60 fps.
2. Fase 3: concluída; editor TipTap, autosave transacional, wikilinks, navegação, backlinks, tags e subnotas cobertos por Vitest e E2E.
3. Fase 4 concluída: histórico, atalhos principais, seleção por modificador e caixa, DnD desktop/touch com auto-pan/cancelamento e operações em lote de mover, excluir, tags, cor e ícone implementados e validados.
4. Fase 5 concluída: busca MiniSearch, modo `>`, recentes, navegação até a nota, TTL/aviso da lixeira, foco no ramo, minimapa e arestas de wikilinks com configuração persistente implementados e validados.
5. Fase 6: round-trip JSON integral em transação e import/export Markdown/OPML da hierarquia, texto e tags implementados; adicionar testes de QuotaExceeded/IDB indisponível, sync multi-aba e auditoria `axe`.
6. Fase 7 iniciada: layout mobile específico para retrato/paisagem, lista hierárquica, gaveta de categorias e editor em bottom sheet/painel lateral reusam os stores existentes e têm E2E. Faltam PWA/offline, onboarding e acabamento de entrega.
7. A cada fase: verificar `lint`, `typecheck`, `test`, `e2e` e `build`; manter cobertura de domínio/db ≥80%, textos pt-BR em `src/i18n`, zero TODO/console.log e registrar decisões/medições.

## Decisões de execução

- O usuário autorizou continuidade automática entre fases; os antigos portões de aprovação não suspendem o trabalho.
- Nenhuma métrica de desempenho será declarada aprovada sem medição reproduzível no navegador e registro do ambiente.
- A stack obrigatória do prompt prevalece; qualquer troca de dependência deve ser justificada em `docs/DECISIONS.md`.

## IA para projetos — primeira entrega

- ✅ Exportação de contexto da categoria ativa pelo app, sem modificar notas e com IDs, caminhos, tags e wikilinks.
- ✅ Pasta Markdown compatível com Obsidian; após sincronizar, gravações do app são write-through e a sincronização usa snapshot de três vias, preservando divergências em `.novamente/conflicts/`.
- ✅ `ai:context` limita o resultado por orçamento aproximado de tokens, ancora no resumo do projeto e inclui pais, wikilinks e backlinks com proveniência.
- ✅ `ai:prepare --root` cria um vault com uma categoria/projeto e seus descendentes; `.novamente/base.json` contém somente esse escopo.
- ✅ `ai:package --root --base` exige um backup completo atual, rejeita mudanças para fora do projeto e gera relatório de alterações/conflitos.
- ⏳ Próximas melhorias: sincronização automática sem clique, busca semântica opt-in, fila de propostas no app, histórico durável e interface local de ferramentas para agentes.

## Lançamento open-source (fora das 7 fases)

- ⏳ Licença MIT + CI + templates + CONTRIBUTING + conduta + READMEs EN/pt-BR (infra no repo; falta publicar).
- ⏳ Issues iniciais `good first issue`/`help wanted` e higiene do GitHub (descrição, topics, preview).
- ⏳ Lançamento BR (TabNews, comunidades dev) e depois global (Reddit, Show HN, diretórios MCP).
