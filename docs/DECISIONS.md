# DECISIONS — decisões e motivações

Registro no formato: **decisão → motivo → consequência**. Atualizado a cada fase.

## 0. Ajustes aprovados pelo usuário (plano de execução)

1. **Portões de aprovação após as Fases 1, 2 e 4** (relatório no formato §18 ao final de cada fase) → alinha o desenvolvimento iterativo sem travar as demais.
2. **E2E Playwright crescendo desde a Fase 2** → teste de regressão do fluxo real desde que o canvas exista; se o ambiente não baixar o navegador, avisar cedo e propor alternativa.
3. **Árvore ARIA, roving tabindex e navegação por setas na Fase 2** → acessibilidade nasce junto com o canvas; a Fase 6 audita e corrige. O modelo de dados já suporta a lista mobile (Fase 7) reusando a mesma árvore.
4. **Densidades Confortável (44 px, padrão) / Compacto (36 px) e escalas 100/115/130%** → entram no cálculo de layout (`d3-hierarchy` recebe `nodeSize` derivado desses tokens).
5. **Teste automático de contraste dos tokens (tema escuro e claro, mínimo AA) que quebra o build** → regra de qualidade, não opcional; roda via `prebuild`.
6. **Zoom mínimo legível de 0,6** (`ZOOM_LEGIBLE_MIN`): abaixo disso os nós viram simplificados com tooltip; `ZOOM_MIN = 0,2` evita nó "de pulga" ilegível.
7. **Medir 60 fps com seed de 5.000 notas na Fase 2** e registrar em `docs/ARCHITECTURE.md`.

## 1. Visual e experiência (redesign — Testenote.html só como referência)

1. **Tema escuro é o padrão; tema claro completo nas configurações** → contexto pessoal/noturno predominante; `data-theme` no `<html>`.
2. **Estilo "amigável e acolhedor" e inclusivo por idade** → base de 16 px, nós com 14–15 px, alvos de toque ≥ 44 px, ícone+label nos controles principais, nenhuma informação só por cor, movimento ≤ 200 ms (sidebar 250 ms por ser mudança de layout especificada), foco visível sempre.
3. **Movimento controlado por JS (`data-motion="reduced"|"full"`)** e não só por `prefers-reduced-motion` → a configuração "Movimento" do usuário precisa vencer o sistema, e testes conseguem forçar o estado.
4. **Microcopy toda em pt-BR via `src/i18n` com `t()` tipado** → nenhum texto visível fora do dicionário; parâmetros via `{chave}`.
5. **IDs ULID (`ulid`)** para notas, links e toasts → ordenáveis cronologicamente e globais (prepara sync, fora do MVP).

## 2. Arquitetura e código

1. **Zustand sem `immer`** → as escritas são pontuais (spread raso em `withNotes` + reindexação derivada); `immer` só entra se a Fase 4 (Command/desfazer) demonstrar necessidade real. Justificativa à stack obrigatória do prompt §2.
2. **Ações de store como propriedades arrow e interfaces com tipos de propriedade** (`toast: (...) => void`) → evita o erro `@typescript-eslint/unbound-method` nas telas que leem `state.toast` e mantém o lint limpo sem `disable`.
3. **Índice `parentId → filhos` derivado em memória (`reindexChildren`)** → nunca persistido (regra §8.9); recalculado a cada commit do store.
4. **Fallback de erro isolado por painel (`ErrorBoundary` em sidebar/canvas/editor)** → um painel que falha não derruba os outros (refinado na Fase 6).
5. **Registro de ícones curado em `src/components/ui/icons.ts`** (~225 nomes kebab-case verificados no pacote) com fallback `circle` → zero CDN, zero `@latest`, ícone desconhecido não quebra layout; `Icon.tsx` exporta só o componente (React Fast Refresh limpo).
6. **Confirmação inline na lixeira** (mesmo diálogo, botões Sim/Não) → evita diálogo aninhado; exclusão para lixeira é recuperável e por isso usa toast com **Desfazer** em vez de confirmação (§8.3/§16).
7. **Falha de IndexedDB mostra tela de erro com "Tentar novamente"** (`StorageUnavailableError`); modo somente memória fica para a Fase 6 (§9).
8. **`eslint.config.js` está fora do `tsconfig`** → adicionado ao `ignores` do próprio ESLint (o project service não o enxerga).
9. **Seletores Zustand devolvem primitivos/refs estáveis** → `useShallow` não detecta igualdade de `Note[][]` (arrays aninhados novos a cada render) e isso gerou loop infinito na lixeira; solução: seletor de **ids** de raiz + agrupamento derivado em `useMemo` (regressão coberta por teste).
10. **`frame-ancestors` removido do CSP em `<meta>`** → diretiva só vale em header HTTP; o navegador logava erro de consola.

## 5. Fase 2 — árvore

1. **`d3-hierarchy` com `tree().nodeSize()` e medição de texto via Canvas 2D** → separa o layout puro da UI e mantém espaçamento dinâmico; largura de coluna acompanha o maior rótulo de cada nível.
2. **Arestas em SVG e nós em HTML, com pan/zoom próprio por Pointer Events** → preserva texto selecionável/acessível e permite pan por rolagem/arrasto, Ctrl/⌘+rolagem e pinça para zoom sem uma dependência extra de zoom.
3. **Culling por viewport com margem de 300 px** → reduz elementos DOM durante navegação; layout continua sendo calculado para todos os nós expandidos.
4. **`viewStore` mantém expansão, seleção, pan e zoom por categoria em `views`** → estado de navegação não se mistura com histórico de edição futuro; gravação é adiada e descarregada ao sair da página.
5. **Layout da árvore guarda apenas nós descendentes da categoria** → categoria raiz permanece representada na barra lateral e não duplica um item dentro do canvas.

## 6. Fase 3 — editor e links (concluída)

1. **TipTap v3.31.4 fixado na mesma versão entre os pacotes** → compatível com React 18 e com o padrão oficial de integração React; a versão fica explícita no lockfile para builds repetíveis. [Documentação oficial React](https://tiptap.dev/docs/editor/getting-started/install/react)
2. **StarterKit + extensões oficiais para tarefas, tabelas e placeholder; wikilink como nó inline atômico** → conteúdo continua JSON estruturado, o ID do destino persiste e o NodeView consulta o título atual sem reescrever as notas que apontam para ele. [NodeViews React](https://tiptap.dev/docs/editor/extensions/custom-extensions/node-views/react)
3. **Gravação do documento e reconstrução dos links na mesma transação Dexie** → evita estado persistido em que o conteúdo novo e o índice de backlinks divergem.
4. **Sugestões de wikilink usam um nó inline atômico com ID de destino** → renomear a nota reflete automaticamente nos usos; seleção/criação do alvo mantém o editor e a navegação sincronizados.
5. **Colagem HTML é sanitizada com DOMPurify antes de entrar no ProseMirror** → permite formatação e reduz risco de markup não permitido vindo de conteúdo externo.

## 7. Fase 4 — teclado, arrastar e histórico (em andamento)

1. Implementar histórico estrutural fora do `viewStore` → undo/redo não deve reverter pan, zoom ou expansão, nem conflitar com o histórico local do TipTap.
2. **Atalhos globais ignoram inputs, textareas e conteúdo editável** → preserva a digitação; criação, alternância de painéis, undo/redo e atalhos de nós têm cobertura E2E.
3. **Lista de subnotas pagina em grupos de 40** → categorias com milhares de filhos não montam milhares de botões ao abrir o editor.
4. **Nível largo recolhido usa layout linear equivalente ao tidy tree** → evita alocar nós hierárquicos para milhares de irmãos uniformemente espaçados; árvores expandidas continuam usando `d3-hierarchy`.
5. **Histórico estrutural em memória, limitado a 200 comandos, com snapshots e atualizações transacionais de notas/links** → desfazer não invade o histórico local do editor nem o estado de navegação; cobre criação, renomeação, mover/reordenar, lixeira/restauração, estilo, tags e duplicação. Reiniciar a página inicia uma pilha vazia.
6. **DnD desktop nativo com alvos antes/dentro/depois e atalhos para teclado** → evita dependência adicional e conserva operação por teclado; auto-pan, touch e seleção por caixa permanecem pendentes.
7. **Seleção múltipla temporária no `uiStore`, com Ctrl/⌘-clique e Shift-clique** → seleção é estado da interface, não dado persistido; operações em lote atuais incluem tags e lixeira.
8. **Busca MiniSearch reconstruída do estado vivo das notas, com normalização de diacríticos** → não mantém um segundo índice persistido sujeito a divergência; o atalho é ignorado enquanto o usuário digita em campos editáveis.
9. **Atalhos de histórico encadeados em fila assíncrona** → serializa comandos enquanto IndexedDB confirma undo/redo e evita perder um segundo atalho pressionado rapidamente.

## 8. Fase 5 — busca e navegação (em andamento)

1. **Expurgo por retenção é parte do bootstrap e transaciona notas, links e views** → nenhum grupo vencido fica parcialmente removido após a inicialização.
2. **Prazo mostrado em dias inteiros arredondados para cima** → o usuário sabe quando a exclusão definitiva ocorrerá sem precisar calcular horário exato.
3. **Arestas de wikilinks desenhadas em camada SVG separada e controladas por preferência persistente** → o estado da árvore continua legível e o usuário pode desligar as conexões sem alterar os dados dos links.

## 9. Fase 7 — mobile

1. **Retrato abre na lista hierárquica; paisagem abre no canvas** → privilegia leitura e navegação tocável no espaço estreito, mantendo o mapa como visão principal quando há largura. A alternância lista/mapa permanece disponível.
2. **Categorias em drawer e editor em bottom sheet no retrato/painel lateral na paisagem** → mantém o contexto da lista ou do mapa durante a seleção; os mesmos stores e repositórios servem desktop e mobile.
3. **Breakpoints consideram altura curta em paisagem além da largura de 639 px** → celulares horizontais costumam ter viewport com largura acima do breakpoint de retrato.
4. **Canvas mobile oculta o cabeçalho duplicado, as linhas da sidebar e o minimapa, e ajusta a árvore ao viewport ao entrar/trocar orientação** → libera área útil e evita conectores da categoria cortando os nós quando a sidebar está na gaveta.

## 3. Ambiente

1. **Node 20 obrigatório no ambiente** (`~/.local/node-v20.20.2-linux-x64`); o `/usr/bin/node` é v12 e não serve.
2. **`npm install --legacy-peer-deps`** → o arborist desta versão trava com `edgesOut` null nas dependências React 18 + plugin Vite 6.
3. **Playwright: download do Chromium rastreado em `/tmp/opencode/pw-install.log`** → concluído (chromium-1243 + headless-shell + ffmpeg em `~/.cache/ms-playwright`); E2E a partir da Fase 2.
4. **Smoke em navegador real na Fase 1 (fora do repositório)** → Playwright ad-hoc validou: carga com seed, criar/renomear categoria, tema claro, persistência após reload, excluir com toast, lixeira com grupo, restaurar e persistir — zero erros de página.

## 4. Escopos adiados (com fase marcada)

| Item | Fase | Motivo |
|---|---|---|
| "Exportar categoria" no menu | Fase 7 | depende de export JSON/Markdown/OPML |
| Sidebar recolhida por padrão em 640–1023 px | Fase 6/7 | responsividade completa ainda não implementada |
| Modo somente memória (banco indisponível) | Fase 6 | seção 9 |
| Seleção por caixa, touch/auto-pan no DnD e estilo/mover em lote | Fase 4 | extensão pendente da interação desktop atual |
