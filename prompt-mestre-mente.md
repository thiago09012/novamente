# PROMPT MESTRE: construir o "NOVAMENTE" (app de notas em árvore)

> Como usar: cole este documento inteiro na sua IA de código (Claude Code, Cursor, etc.) e anexe o arquivo `Testenote.html` como referência visual. Peça para ela trabalhar **fase por fase** (seção 15) e só avançar quando os critérios de aceite da fase anterior passarem.

---

## 0. PAPEL E REGRAS DE TRABALHO

Você é um engenheiro de software sênior e designer de produto. Sua tarefa é transformar o protótipo anexo (`Testenote.html`) em um **produto real, completo, estável e polido**, não em outro protótipo.

Regras de conduta:

1. **Entregue código completo e executável.** Nada de trechos, `// ...resto igual`, TODOs ou funções vazias. Cada arquivo deve ser escrito por inteiro.
2. **Trabalhe em fases** (seção 15). Ao fim de cada fase: rode build, lint, typecheck e testes; mostre o resultado; liste o que foi feito e o que falta.
3. **Não pergunte o que dá para decidir.** Se algo estiver ambíguo, escolha a opção mais segura, registre em `docs/DECISIONS.md` (decisão + motivo) e siga. Pergunte apenas se a dúvida bloquear completamente o trabalho.
4. **Não invente funcionalidade fora do escopo**, mas trate **todos** os estados, erros e casos de borda do escopo (seções 9 a 12).
5. **Nunca use `localStorage` como armazenamento principal**, nunca use `innerHTML` com conteúdo do usuário, nunca deixe `any` sem justificativa.
6. Todo texto visível ao usuário em **português (pt-BR)**, centralizado em um arquivo de i18n (estrutura pronta para adicionar inglês depois).
7. Ao encontrar um problema do protótipo listado na seção 13, **não o reproduza**.

---

## 1. VISÃO DO PRODUTO

**MENTE** é um app de notas onde **a hierarquia de notas é a própria navegação visual**. O usuário organiza o conhecimento como uma árvore horizontal (mapa mental) que nasce da barra lateral. Cada nó da árvore **é uma nota**, não um rótulo solto.

Ideia central (preservar):

- A **barra lateral** lista as **categorias**. A categoria ativa é a **raiz da árvore**: linhas curvas saem da borda da sidebar, a partir do item ativo, em direção aos filhos diretos.
- Cada **nó** tem uma nota associada, aberta no painel de edição à direita.
- Notas se conectam também por **links `[[Nota]]`** (conexões transversais, inclusive entre categorias) com **backlinks**.

Resumo: **estrutura em árvore + links = grafo de conhecimento**, navegado como mapa mental.

Público do MVP: pessoas que pensam em estrutura e hierarquia (estudantes, pesquisadores, escritores, quem monta um "segundo cérebro"). Prioridade: velocidade de captura, teclado em primeiro lugar, zero perda de dados.

Princípios:
- **Local-first**: funciona 100% offline, dados no dispositivo (IndexedDB). Sem conta no MVP.
- **Sem perda de dados**: autosave, desfazer/refazer, lixeira, exportação.
- **Teclado primeiro**, mouse e toque como equivalentes completos.
- **Rápido**: 60 fps com 5.000 notas; abrir o app em menos de 1 s.

---

## 2. STACK (obrigatória, salvo justificativa em DECISIONS.md)

| Camada | Escolha |
|---|---|
| Build | Vite + TypeScript (strict) |
| UI | React 18 |
| Estilo | Tailwind CSS **compilado** (sem CDN) + CSS variables para tokens |
| Estado | Zustand (+ immer) |
| Persistência | Dexie (IndexedDB) |
| Editor | TipTap (ProseMirror) com extensões customizadas |
| Layout da árvore | `d3-hierarchy` (`tree()` com `nodeSize`) |
| Busca | MiniSearch (índice em memória, reconstruído do banco) |
| Ícones | `lucide-react` (importar só os usados, nunca `@latest` via CDN) |
| Ordenação | Fractional indexing (`fractional-indexing`) para `orderKey` |
| IDs | ULID |
| Sanitização | DOMPurify (importação/colagem) |
| Testes | Vitest + Testing Library (unidade/componente), Playwright (E2E) |
| Qualidade | ESLint, Prettier, `tsc --noEmit`, Husky opcional |
| PWA | `vite-plugin-pwa` (instalável, offline) |

Estrutura de pastas:

```
src/
  app/            # bootstrap, providers, rotas, ErrorBoundary
  domain/         # tipos, regras puras (árvore, links, ordenação), sem React
  db/             # Dexie, migrações, repositórios, import/export
  store/          # Zustand: notes, view, ui, history, settings
  features/
    sidebar/  canvas/  editor/  search/  trash/  settings/  onboarding/  io/
  components/     # primitivos de UI (Button, Menu, Dialog, Toast, Tooltip...)
  hooks/  lib/  i18n/  styles/  tests/
docs/             # DECISIONS.md, ARCHITECTURE.md, SHORTCUTS.md
```

Regra: `domain/` não importa React nem Dexie. Toda regra de negócio (mover, validar ciclo, calcular caminho, resolver links) é função pura **com testes**.

---

## 3. MODELO DE DADOS

```ts
type ID = string; // ULID

interface Note {
  id: ID;
  parentId: ID | null;      // null = esta nota é uma CATEGORIA (raiz)
  orderKey: string;         // fractional index, ordem entre irmãos
  title: string;            // pode ser vazio; exibir "Sem título"
  content: JSONContent;     // documento TipTap
  contentText: string;      // texto puro, para busca
  icon: string;             // nome de ícone lucide; padrão por tipo
  color: string | null;     // token de cor da paleta (ver seção 5.8)
  tags: string[];           // sem '#', minúsculas, únicas
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null; // soft delete (lixeira)
  deletedRootId: ID | null; // id da nota que originou a exclusão em cascata
}

interface Link {            // derivado do conteúdo, reconstruído ao salvar a nota
  id: ID;
  fromId: ID;
  toId: ID | null;          // null = link não resolvido (nota inexistente)
  toTitle: string;          // texto original, para links não resolvidos
}

interface ViewState {       // por categoria; NÃO vai para o histórico de undo
  rootId: ID;
  expanded: Record<ID, boolean>;
  panX: number; panY: number; zoom: number;
  selectedId: ID | null;
}

interface Settings {
  theme: 'dark' | 'light' | 'system';
  showLinkEdges: boolean;
  sidebarCollapsed: boolean;
  editorWidth: number;
  editorOpen: boolean;
  reducedMotion: 'system' | 'on' | 'off';
  lastCategoryId: ID | null;
  schemaVersion: number;
}
```

Regras:
- **Categoria = nota com `parentId = null`.** Não existe tabela separada. A categoria também tem nota própria (editável) e aparece como raiz virtual no canvas (não desenhada como nó, e sim representada pelo item da sidebar).
- **Contagem de notas** da categoria é **calculada** (nunca armazenada). Conta descendentes não excluídos.
- **Links no conteúdo guardam o `id` do alvo**, e o texto exibido vem do título atual. Renomear uma nota atualiza a exibição em todos os lugares **sem reescrever** outras notas.
- Índices Dexie: `parentId`, `[parentId+orderKey]`, `deletedAt`, `updatedAt`, `*tags`, e na tabela de links `fromId` e `toId`.
- **Migrações versionadas** (`schemaVersion`), com teste de migração.
- Todas as escritas em **transações**; operações compostas (mover, excluir em cascata, restaurar) são atômicas.

---

## 4. LAYOUT GERAL DA INTERFACE

Três zonas lado a lado, ocupando 100% da viewport (`100dvh`), sem scroll da página:

```
┌────────────┬─────────────────────────────────────┬──────────────────┐
│  SIDEBAR   │            CANVAS (ÁRVORE)          │  PAINEL EDITOR   │
│  56–240px  │               flexível              │   320–640px      │
└────────────┴─────────────────────────────────────┴──────────────────┘
```

- **Sidebar**: 240 px expandida, 56 px recolhida (animação 250 ms, respeita `prefers-reduced-motion`). Estado persistido.
- **Editor**: largura padrão 420 px; redimensionável arrastando a borda esquerda (mín. 320, máx. 640 ou 50% da tela); recolhível; estado persistido.
- **Canvas**: ocupa o resto. Ao recolher/expandir painéis, **o canvas é recalculado sem perder o ponto de foco** (mesmo nó permanece visível).

### Responsividade
- **≥ 1024 px**: três zonas como acima.
- **640–1023 px**: sidebar recolhida por padrão; editor vira **painel sobreposto** (overlay) à direita.
- **< 640 px (celular)**:
  - O canvas **não** é a visão padrão. A visão principal é uma **lista em árvore indentada e recolhível** (mesma fonte de dados, mesmos gestos).
  - Alternância "Árvore | Lista" na barra superior; a visão de mapa continua disponível com pinça para zoom.
  - Sidebar vira gaveta (drawer) lateral; editor vira **bottom sheet** (altura 85%).
  - Alvos de toque ≥ 44×44 px. Pressão longa abre menu de contexto.

---

## 5. ESPECIFICAÇÃO DETALHADA DA INTERFACE

### 5.1 Tokens visuais (derivados do protótipo)

Definir como CSS variables, com tema escuro (padrão) e claro:

| Token | Escuro | Claro |
|---|---|---|
| `--bg-app` | `#0f0f0f` | `#fafaf9` |
| `--bg-sidebar` | `#0a0a0a` | `#f1f0ee` |
| `--bg-editor` | `#121212` | `#ffffff` |
| `--bg-node` | `#1a1a1a` | `#ffffff` |
| `--border` | `#2a2a2a` | `#dedbd6` |
| `--text` | `#e0e0e0` | `#1c1b19` |
| `--text-muted` | `#9a9a9a` (mín. contraste 4.5:1) | `#5f5c57` |
| `--accent` | `#4ade80` | `#16a34a` |
| `--accent-bg` | `#14532d` | `#dcfce7` |
| `--danger` | `#f87171` | `#dc2626` |

- Fonte: Inter (self-hosted, `font-display: swap`) com fallback do sistema. Nada de CDN de fontes.
- Raio: 8 px (nós, botões), 6 px (itens pequenos). Sombras suaves; "glow" verde só em elemento ativo.
- Contraste mínimo WCAG AA em **todos** os textos (o protótipo falha em `#444` e `#555`).

### 5.2 Sidebar

**Cabeçalho (56 px)**: nome "MENTE" (10 px, caixa alta, espaçamento de letras) + botão hambúrguer (recolher). Recolhida: só o botão, centralizado.

**Campo de busca rápida** abaixo do cabeçalho (abre a paleta Ctrl+K; recolhida vira ícone de lupa).

**Lista de categorias** (scroll vertical independente):
- Item: ícone (20 px) + nome (truncado com reticências) + contador de notas. Recolhida: só ícone, com **tooltip** do nome ao passar o mouse/foco.
- Estados: normal, hover, **ativo** (fundo `--accent-bg`, borda `--accent`, glow), foco de teclado (anel visível 2 px), arrastando, alvo de soltura.
- Clique: ativa a categoria e carrega a árvore. Duplo clique ou F2: renomear inline.
- **Menu de contexto** (botão direito, pressão longa ou botão `⋯` no hover): Abrir nota da categoria, Renomear, Trocar ícone, Trocar cor, Duplicar categoria, Exportar categoria, Mover para a lixeira.
- **Arrastar para reordenar** categorias (indicador de linha entre itens).
- **Aceitar nós arrastados do canvas**: soltar um nó sobre uma categoria o move para a raiz dela (como filho direto).
- Botão tracejado **"+ Nova categoria"** no fim da lista: cria categoria "Nova categoria" já em modo de renomear, com o ícone padrão.
- Rodapé fixo da sidebar: **Lixeira** (com contador), **Configurações**, **Ajuda/Atalhos**.

**Linhas saindo da sidebar** (diferencial visual): curvas Bézier da borda direita da sidebar, na altura do item ativo, até a borda esquerda de cada filho direto.
- Se o item ativo estiver **fora da área visível** (sidebar com scroll), a origem das linhas **fica presa** à borda superior ou inferior da lista, com um esmaecimento, em vez de desalinhar.
- Recalcular em: scroll da lista, redimensionamento, recolher/expandir sidebar, pan/zoom (usar `ResizeObserver` e `requestAnimationFrame`, nunca polling).

**Sem categorias**: estado vazio com ilustração simples, texto "Crie sua primeira categoria" e botão primário.

### 5.3 Canvas (árvore)

Mundo infinito com pan e zoom. Fundo pontilhado (grade de 24 px que **acompanha** pan/zoom).

**Controles**:
- **Barra superior direita** (flutuante): Centralizar (Ctrl+0), Ajustar à tela ("fit"), Expandir tudo, Recolher tudo, Expandir até nível N (menu), alternar **Mostrar links** (linhas tracejadas), alternar **Foco no ramo**.
- **Inferior esquerda**: botões de zoom +/− e indicador de porcentagem (clicar volta a 100%).
- **Minimapa** (inferior direita, recolhível), com retângulo da viewport arrastável.

**Navegação**:
- Arrastar o fundo = pan. Roda do mouse/trackpad com dois dedos = **pan**. **Ctrl/⌘ + roda** e **pinça** = **zoom em direção ao cursor** (não ao centro). Limites de zoom: 20% a 250%.
- Ao clicar em nó/abrir nota por link/busca: **expandir automaticamente o caminho até o nó** e animar o pan para centralizá-lo (400 ms, `ease-out`; sem animação se `reduced-motion`).
- Estado de pan/zoom/expansão **por categoria**, persistido; ao voltar para uma categoria, ela reaparece como foi deixada.

**Layout**:
- Usar `d3.tree().nodeSize([alturaLinha, larguraColuna])` aplicado **somente aos nós visíveis** (expandidos).
- A **largura da coluna é dinâmica**: calculada pela largura medida do maior nó de cada profundidade + folga de 64 px (nada de 240 px fixos, rótulos longos não podem invadir a coluna seguinte).
- Rótulos longos: truncar em 40 caracteres com reticências no nó; texto completo no tooltip e no editor.
- Altura do subtree considera **todos os descendentes visíveis** (o protótipo errava isso e gerava sobreposição).
- Reposicionar com **transição suave** (200 ms) quando algo expande/recolhe; o nó que o usuário clicou **não deve sair do lugar na tela** (compensar o pan).

**Renderização e desempenho**:
- Nós como elementos HTML posicionados por `transform: translate`; arestas em um único `<svg>`.
- **Virtualização por viewport (culling)**: só renderizar nós/arestas dentro da área visível + margem de 300 px.
- **Atualização incremental** com chaves estáveis (não reconstruir o DOM inteiro a cada clique, como no protótipo).
- Durante pan/zoom: aplicar **apenas** um `transform` no contêiner (GPU); recalcular linhas da sidebar só nos frames necessários.
- Meta: 60 fps com 5.000 notas totais e até ~400 nós visíveis.

**Anatomia do nó** (altura 34 px):
`[▸ expandir] [ícone] [•indicador de conteúdo] Título [badge nº de filhos quando recolhido] [⚑ nº de links]`
- Folha (sem filhos): borda tracejada, sem botão de expandir (reservar o espaço para alinhar).
- Cor opcional da nota tinge a borda esquerda (3 px).
- **Estados**: padrão, hover, selecionado (anel), **atual** (nota aberta: fundo `--accent-bg`, glow), arrastando (opacidade 60%), alvo de soltura (borda `--accent` tracejada + indicador de posição "acima/dentro/abaixo"), **correspondência de busca** (destaque amarelo no texto), **fora do filtro** (opacidade 30%), nota **sem título** (texto em itálico "Sem título").
- Botão `+` aparece no hover à direita do nó: adiciona **filho**. Botão `+` também aparece abaixo/à esquerda (hover) para **irmão**.

**Arestas**:
- Hierarquia: Bézier da borda direita do pai à borda esquerda do filho; realçar (opacidade 1, espessura 2.5) o **caminho da raiz até o nó atual**.
- Links `[[ ]]`: linhas **tracejadas** em cor secundária (âmbar), ligando o nó ao alvo **quando ambos visíveis**; se o alvo está oculto/em outra categoria, mostrar um **marcador "↗"** no nó com tooltip do destino. Ligável/desligável (padrão: desligado se houver mais de 200 links visíveis).

**Interações**:
- Clique: seleciona e abre a nota. Duplo clique no texto ou F2: **renomear inline** (Enter confirma, Esc cancela, Tab confirma e cria filho).
- Clique no `▸`: expande/recolhe apenas aquele nó. Alt+clique: expande/recolhe **todo o subtree**.
- **Arrastar e soltar** (mouse e toque): mover nó (com subtree) para outro pai ou reordenar entre irmãos. Mostrar fantasma do nó, indicadores de soltura, **auto-pan** nas bordas, Esc cancela. Impedir soltar em si mesmo ou em descendente (cursor "não permitido" + dica "Não é possível mover para dentro de si mesma").
- **Seleção múltipla**: Shift/Ctrl+clique e caixa de seleção (arrastar no fundo com Shift). Ações em lote: mover, excluir, trocar cor/ícone, adicionar tag.
- **Menu de contexto** do nó: Abrir, Renomear, Novo filho, Novo irmão, Duplicar (com ou sem descendentes), Mover para…, Trocar ícone, Trocar cor, Copiar link `[[…]]`, Expandir/Recolher ramo, Focar neste ramo, Excluir.

**Modo foco no ramo**: esconde tudo que não é ancestral, o próprio nó ou descendente; um chip "Foco: Café ✕" no topo; Esc ou clicar no ✕ sai.

### 5.4 Painel do editor

**Cabeçalho (56 px)**: ícone + estado de salvamento (`Salvo`, `Salvando…`, `Erro ao salvar — tentar de novo`) + botões: Abrir em tela cheia (modo foco de escrita), Fixar/Desafixar, Menu `⋯` (Duplicar, Exportar nota em Markdown, Copiar link, Histórico de versões, Excluir) e Fechar.

**Corpo**:
1. **Breadcrumb** clicável: `Categoria › Pai › … › Nota`. Se passar de 4 níveis, abreviar o meio com `…` (menu com os intermediários). O último não é link.
2. **Título** editável (H1, 24 px, `Enter` leva ao corpo, placeholder "Sem título"). Sincroniza com o nó em tempo real (debounce 150 ms).
3. **Corpo rico (TipTap)**: parágrafos, H1–H3, **negrito**, *itálico*, ~~tachado~~, `código`, bloco de código, citação, listas (marcadores, numeradas, **tarefas** com checkbox), divisor, link externo, tabela simples. Menu **"/"** (slash) para inserir blocos e **barra flutuante** ao selecionar texto.
4. **Wikilinks**: digitar `[[` abre autocomplete (busca por título em **todas as categorias**, mostra caminho e categoria; ↑↓ navega, Enter confirma, Esc fecha). Se o texto digitado não existe, a primeira opção é **"Criar 'xyz'"** (cria como filho da nota atual). Link renderizado como "pílula" verde; clique abre a nota (Ctrl/⌘+clique abre sem recentrar o canvas). Link **não resolvido** (alvo excluído/inexistente) aparece em vermelho tracejado com tooltip e ação "Criar nota".
5. **Tags** com `#` (autocomplete das tags existentes), mostradas como chips no rodapé; clique em uma tag filtra o canvas.
6. **Subnotas**: lista dos filhos diretos (clicáveis) com botão "+ Adicionar subnota".
7. **Backlinks**: seção "Mencionada em (N)" com o título de cada nota que linka para esta e um trecho do contexto (±60 caracteres). Clicar abre a nota.
8. **Rodapé de metadados**: criada em / atualizada em (formato relativo + data completa no tooltip), contagem de palavras.

**Salvamento**: autosave com debounce de 500 ms **e** ao perder foco, fechar aba (`visibilitychange`/`pagehide`) e trocar de nota. Gravar `content`, `contentText`, reconstruir `Link[]` da nota e atualizar o índice de busca, tudo em **uma transação**.

**Estado vazio** (nenhuma nota aberta): ícone + "Clique em um nó da árvore ou pressione Ctrl+K para buscar".

### 5.5 Paleta de comandos / Busca (Ctrl/⌘+K)

- Modal central (largura 640 px), foco imediato no campo.
- Dois modos: **Notas** (padrão) e **Comandos** (prefixo `>`). Sem texto: mostra **notas recentes**.
- Busca fuzzy via MiniSearch (título peso 3, tags peso 2, conteúdo peso 1), tolerante a acentos e maiúsculas, com destaque do trecho encontrado.
- Cada resultado: ícone, título, caminho (`Bebidas › Quente`), trecho. ↑↓ navega, Enter abre e **revela no canvas**, Ctrl+Enter abre em segundo plano, Esc fecha.
- Comandos: Nova nota, Nova categoria, Ir para categoria…, Alternar tema, Exportar tudo, Importar, Abrir lixeira, Configurações etc.
- Estados: carregando índice, **sem resultados** (oferece "Criar nota 'termo'"), erro.

### 5.6 Lixeira

Tela/painel listando notas excluídas (agrupadas pela exclusão que as originou). Ações: **Restaurar** (volta ao pai original; se o pai também foi excluído ou não existe mais, restaura na raiz da categoria; se a categoria foi excluída, restaura a categoria junto), **Excluir definitivamente** (confirmação), **Esvaziar lixeira** (confirmação com contagem). Itens com mais de **30 dias** são apagados automaticamente na inicialização, e a UI informa "Será apagada em N dias".

### 5.7 Configurações

Abas/seções: **Aparência** (tema, redução de movimento, tamanho da fonte do editor), **Árvore** (links visíveis por padrão, nível de expansão inicial), **Dados** (exportar tudo, importar, uso de armazenamento, apagar todos os dados com confirmação digitada), **Atalhos** (lista completa, somente leitura no MVP), **Sobre** (versão).

### 5.8 Ícones e cores

- Seletor de ícone: grade pesquisável com ~150 ícones lucide curados, mais "sem ícone". Padrão: pasta para categoria, círculo para nota.
- Paleta de 8 cores + "nenhuma", todas com variantes para tema claro/escuro validadas em contraste.

### 5.9 Feedback e microcopy

- **Toasts** (máx. 3 empilhados, 4 s, pausam no hover) para: ação concluída (com botão **Desfazer** quando aplicável), erros, avisos.
- **Confirmações modais** só para ações irreversíveis (excluir definitivamente, esvaziar lixeira, apagar tudo). Exclusão normal vai para a lixeira **sem modal**, com toast "Movida para a lixeira · Desfazer".
- Tooltips em todo botão só com ícone, com o atalho exibido.
- Skeletons no carregamento inicial (sidebar e canvas), nunca tela em branco.

---

## 6. ATALHOS DE TECLADO (todos documentados em `docs/SHORTCUTS.md` e na tela de ajuda)

Navegação na árvore (com foco no canvas):
| Tecla | Ação |
|---|---|
| `↑` `↓` | nó anterior / seguinte entre irmãos (visíveis) |
| `←` | recolhe; se já recolhido, vai ao pai |
| `→` | expande; se já expandido, vai ao primeiro filho |
| `Enter` | **novo irmão** abaixo (entra em renomear) |
| `Tab` | **novo filho** (entra em renomear) |
| `Shift+Tab` | **promover** (vira irmão do pai) |
| `Alt+↑` `Alt+↓` | reordenar entre irmãos |
| `F2` | renomear |
| `Espaço` | expandir/recolher |
| `Delete` / `Backspace` | mover para a lixeira |
| `Ctrl/⌘+D` | duplicar |
| `E` | focar o editor |
| `Esc` | cancela / limpa seleção / sai do modo foco |

Globais: `Ctrl/⌘+K` busca, `Ctrl/⌘+Z` desfazer, `Ctrl/⌘+Shift+Z` ou `Ctrl+Y` refazer, `Ctrl/⌘+B` sidebar, `Ctrl/⌘+\` editor, `Ctrl/⌘+0` centralizar, `Ctrl/⌘+1` ajustar à tela, `Ctrl/⌘+/` atalhos, `Ctrl/⌘+Shift+N` nova categoria, `Ctrl/⌘+N` nova nota.

Regras: atalhos de nó **não disparam** enquanto o usuário digita em campo de texto/editor; respeitar `⌘` no macOS e `Ctrl` nos demais; não sequestrar atalhos do navegador sem necessidade.

---

## 7. DESFAZER / REFAZER

- Padrão **Command** com pilha (limite 200). Cada comando tem `do` e `undo` e roda em transação.
- Entram no histórico: criar, renomear, mover, reordenar, excluir/restaurar, duplicar, trocar ícone/cor/tags, operações em lote (**um único passo**).
- Edição de texto usa o histórico interno do TipTap (separado) enquanto o editor tem foco; fora dele, valem os comandos de estrutura.
- Pan/zoom/expansão **não** entram no histórico.
- Desfazer deve **restaurar a seleção e centralizar** o nó afetado.
- Após recarregar a página, o histórico é descartado (documentar).

---

## 8. REGRAS DE NEGÓCIO

1. **Mover**: proibido mover para si mesmo ou para descendente (validar no domínio, **não só na UI**). Mover entre categorias é permitido (a nota passa a pertencer à nova raiz; links continuam válidos por usarem `id`).
2. **Reordenar**: calcular `orderKey` entre vizinhos; se as chaves ficarem longas demais (> 64 chars), **reindexar** os irmãos em transação.
3. **Excluir nota com filhos**: exclui em cascata o subtree (soft delete, mesmo `deletedRootId`). Toast informa a contagem ("Nota e 12 subnotas movidas…"). Opção no menu "Excluir só esta nota (promover filhos)".
4. **Excluir categoria**: mesma regra; se era a categoria ativa, ativar a próxima (ou a anterior; ou estado vazio se não houver nenhuma).
5. **Links para nota excluída**: viram "não resolvidos" na exibição; ao **restaurar** a nota, voltam a resolver automaticamente (por `id`).
6. **Duplicar**: gera novos IDs; título "Cópia de …"; links internos ao subtree duplicado são **reapontados** para as cópias; links externos permanecem.
7. **Título duplicado** é permitido (a identidade é o `id`); no autocomplete de `[[`, desambiguar mostrando o caminho.
8. **Limites**: título até 200 caracteres; profundidade máxima 50 níveis (bloquear com mensagem clara); tags até 30 por nota, 40 caracteres cada.
9. **Contagens e caminhos** são derivados (nunca duplicar dado derivado no banco).
10. **Tags**: normalizadas (minúsculas, sem acento opcional configurável, sem espaços); renomear tag globalmente é fora do escopo do MVP.

---

## 9. TRATAMENTO DE ERROS E CASOS DE BORDA (obrigatório cobrir todos)

**Armazenamento**
- IndexedDB indisponível (modo privado antigo/bloqueado): mostrar tela de erro explicativa e oferecer modo **somente memória** com aviso permanente de que **nada será salvo**.
- `QuotaExceededError`: avisar com toast persistente, parar de gravar com segurança, manter dados em memória e oferecer exportar imediatamente.
- Falha de transação: **rollback**, UI volta ao estado anterior, toast com "Tentar novamente".
- Banco corrompido/versão futura: não apagar nada; oferecer exportar o que for legível; registrar o erro.
- **Várias abas abertas**: usar `BroadcastChannel` para sincronizar mudanças entre abas; conflito = **última escrita vence por nota** (`updatedAt`), com aviso se a nota aberta foi alterada em outra aba ("Esta nota foi alterada em outra aba · Recarregar").
- Pedir `navigator.storage.persist()` para reduzir risco de despejo pelo navegador.

**Dados**
- Primeira execução: criar **árvore de exemplo** (as categorias do protótipo: Comida, Bebidas, Livros) marcada como exemplo, apagável de uma vez.
- Nota sem `content` válido: tratar como documento vazio, nunca quebrar.
- Referências órfãs (`parentId` inexistente) na inicialização: mover para categoria de recuperação "Recuperadas" e avisar.
- Ciclos detectados em dados importados/corrompidos: quebrar o ciclo e registrar.
- Títulos vazios, só espaços, emojis, RTL, textos muito longos, caracteres especiais e HTML no título: **sempre tratados como texto**, nunca interpretados.

**Interface**
- **Error Boundary** global e por painel: um painel que falha não derruba os outros; botão "Recarregar painel" e "Copiar detalhes do erro".
- Árvore vazia (categoria sem filhos): dica "Esta categoria está vazia — pressione Tab ou clique em + para criar a primeira nota".
- Categoria com milhares de filhos diretos: renderização com culling + **agrupar** "+ 500 mais…" em colunas quando exceder 100 irmãos visíveis.
- Nota aberta excluída em outra aba/ação: fechar o editor, mostrar toast com **Desfazer**.
- Perda de foco durante arrastar; arrastar para fora da janela; soltar no vazio: cancelar sem efeito colateral.
- Redimensionar janela durante animação; zoom do navegador (Ctrl +/−): layout permanece correto.
- Duplo envio, cliques repetidos rápidos, criação de nó durante outra criação: operações **idempotentes** ou serializadas.
- Fonte/ícone não carregou: fallback sem quebrar layout.

**Rede**: o app não depende de rede. Offline é o estado normal; sem banners de "sem conexão".

---

## 10. IMPORTAR E EXPORTAR (confiança do usuário)

**Exportar**:
- **Tudo**: arquivo `.json` com `schemaVersion`, notas (incluindo lixeira opcional), links, tags, configurações.
- **Markdown**: `.zip` com uma pasta por categoria e subpastas por nota-pai; cada nota vira `.md` com frontmatter YAML (`title`, `tags`, `created`, `updated`, `icon`, `color`) e links como `[[Título]]`. Compatível com Obsidian.
- **OPML** (uma categoria ou tudo) para outliners/mapas mentais.
- **Nota/ramo único**: Markdown ou PDF (impressão do navegador com CSS de impressão limpo).
- Lembrete mensal discreto para exportar um backup (desativável).

**Importar**:
- `.json` do próprio app (validação com **Zod**; mostrar prévia: "N categorias, M notas"; opções Mesclar ou Substituir; **sempre criar backup automático** antes de substituir).
- `.zip`/`.md` (Obsidian/Markdown) e `.opml`: converter para notas; links `[[Título]]` resolvidos por título; não resolvidos ficam como links pendentes.
- Todo conteúdo importado passa por **DOMPurify/validação de schema**. Arquivos inválidos: erro claro e **nada é gravado**. Importação em lotes com barra de progresso, cancelável.

---

## 11. SEGURANÇA E PRIVACIDADE

- Nenhum `innerHTML` com dado do usuário. Conteúdo de nota só é renderizado pelo schema do TipTap.
- Links externos: `rel="noopener noreferrer nofollow"`, `target="_blank"`, apenas protocolos `http`, `https`, `mailto` (bloquear `javascript:`, `data:`).
- **CSP** restritiva (sem `unsafe-inline` de script), sem scripts de terceiros em runtime.
- Sem telemetria no MVP. Se algum dia houver, será opt-in e documentada.
- Colagem: sanitizar HTML colado; imagens coladas não são suportadas no MVP (mostrar aviso, não falhar silenciosamente).

---

## 12. ACESSIBILIDADE, INTERNACIONALIZAÇÃO, MOVIMENTO

- A árvore segue o padrão **ARIA `tree`/`treeitem`** (`aria-expanded`, `aria-level`, `aria-selected`, `aria-setsize/posinset`), com **roving tabindex** e a navegação por setas da seção 6. O canvas visual e a árvore acessível são **a mesma estrutura de dados**.
- Foco **sempre visível**; ordem de foco lógica (sidebar → canvas → editor); foco devolvido corretamente ao fechar modais; *focus trap* em diálogos.
- Anúncios para leitores de tela (`aria-live`) em: nota criada/movida/excluída, resultado de busca, estado de salvamento.
- Respeitar `prefers-reduced-motion` e `prefers-color-scheme`. Contraste AA. Nada transmitido só por cor (usar também forma/ícone/texto).
- Alvos de toque ≥ 44 px no mobile. Zoom de texto do navegador até 200% sem perda de função.
- Todas as strings em `i18n/pt-BR.ts`; datas e números via `Intl` com o locale do usuário.

---

## 13. PROBLEMAS DO PROTÓTIPO QUE NÃO PODEM SER REPETIDOS

1. Dados fixos no código e **nada persistido**; botão Salvar sem efeito → resolvido por Dexie + autosave.
2. Edição em `contenteditable` que **não volta ao modelo** → resolvido por TipTap controlado.
3. Links `[[ ]]` falsos, com `onclick` e IDs escritos à mão → wikilinks reais por `id`, autocomplete e backlinks.
4. Índice só da categoria ativa, então links entre categorias falham → índice global.
5. Abrir nota em ramo recolhido não mostra nada → expandir caminho automaticamente.
6. `calculatePositions` ignorando altura dos netos (sobreposição) e espaçamento fixo de 240 px → `d3-hierarchy` + larguras medidas.
7. `lucide.createIcons()` chamado antes de os nós existirem (ícones dos nós não renderizam) → `lucide-react`.
8. Reconstrução total do DOM a cada clique e redesenho total do SVG a cada frame de pan → atualização incremental + culling + `transform` único.
9. `innerHTML` com conteúdo editável (XSS) → renderização só por schema.
10. Linhas da sidebar desalinham com scroll → origem presa às bordas + observers.
11. Tailwind CDN, `lucide@latest`, `unpkg` → dependências versionadas e empacotadas.
12. Contadores fixos (`noteCount`) → derivados.
13. Zoom sem Ctrl conflitando com rolagem de trackpad e zoom no centro → pan por padrão, zoom no cursor com Ctrl/pinça.
14. Sem teclado, sem ARIA, contraste insuficiente, sem mobile → seções 4, 6 e 12.
15. `setTimeout` mágicos para sincronizar renderização → `ResizeObserver`, `requestAnimationFrame` e efeitos declarativos.

---

## 14. DESEMPENHO, QUALIDADE E TESTES

**Metas** (medir e registrar em `docs/ARCHITECTURE.md`):
- Carga inicial < 1 s em máquina mediana; JS inicial < 250 kB gzip (code-splitting do editor e do import/export).
- 5.000 notas: abrir categoria < 200 ms; busca < 50 ms; pan/zoom 60 fps; digitação sem atraso perceptível.
- Gerar um seed de 5.000 notas para teste de carga (`npm run seed:stress`).

**Testes obrigatórios**:
- **Unidade (domínio)**: validação de ciclo, mover entre categorias, reordenação e reindexação de `orderKey`, caminho/breadcrumb, resolução de links, duplicação com reapontamento, exclusão em cascata e restauração, normalização de tags, migrações.
- **Componente**: nó (todos os estados), sidebar, editor (wikilink, tags, salvamento), paleta de comandos.
- **E2E (Playwright)**: criar categoria → criar nós com Tab/Enter → renomear → escrever com `[[` → navegar por link → arrastar para mover → excluir → desfazer → restaurar da lixeira → exportar → limpar dados → importar → recarregar e verificar persistência; fluxo mobile em viewport 390×844; navegação só com teclado.
- **Acessibilidade**: `axe` automatizado nas telas principais.
- Cobertura mínima de 80% em `domain/` e `db/`.

CI local: `npm run lint && npm run typecheck && npm run test && npm run e2e && npm run build` deve passar sem avisos.

---

## 15. FASES DE ENTREGA E CRITÉRIOS DE ACEITE

**Fase 1: Fundação**
Projeto Vite/TS, tokens, layout de 3 zonas, Dexie com modelo e migrações, repositórios, store, seed de exemplo, sidebar com CRUD de categorias.
*Aceite*: recarregar a página mantém tudo; categorias criadas/renomeadas/reordenadas/excluídas (lixeira); testes de domínio passando.

**Fase 2: Árvore**
Canvas com `d3-hierarchy`, largura dinâmica, expandir/recolher, linhas da sidebar, pan/zoom no cursor, centralizar/ajustar, culling, CRUD de nós (botões, menu de contexto, renomear inline), estados visuais.
*Aceite*: nenhuma sobreposição de nós em árvore com 4 níveis e 20 filhos por nó; 60 fps com seed de 5.000 notas; criar/renomear/excluir nós funciona e persiste.

**Fase 3: Editor e links**
TipTap com todos os blocos, título sincronizado, autosave, breadcrumb, `[[` com autocomplete e criação, links não resolvidos, backlinks, tags, subnotas.
*Aceite*: link entre categorias funciona; renomear nota atualiza exibição em todo lugar; abrir nota em ramo recolhido expande e centraliza; fechar a aba durante digitação não perde texto.

**Fase 4: Teclado, arrastar e histórico**
Todos os atalhos, arrastar/soltar (mover, reordenar, entre categorias, auto-pan, cancelar), seleção múltipla e lote, Command pattern com desfazer/refazer.
*Aceite*: fluxo completo de criação só com teclado; mover para descendente é bloqueado; desfazer reverte qualquer ação estrutural, inclusive em lote, com 1 passo.

**Fase 5: Busca, lixeira, foco, minimapa, links no canvas**
Paleta Ctrl+K (notas + comandos), lixeira com restauração inteligente e limpeza de 30 dias, modo foco no ramo, minimapa, arestas de link.
*Aceite*: busca encontra por título/tag/conteúdo sem acento; restaurar nota cujo pai foi excluído funciona; links tracejados ligam/desligam.

**Fase 6: Dados, robustez e acessibilidade**
Exportar/importar (JSON, Markdown, OPML), todos os erros da seção 9, multi-aba, ErrorBoundary, ARIA completo, tema claro, configurações.
*Aceite*: exportar → apagar tudo → importar restaura 100%; simular `QuotaExceeded` e banco indisponível sem crash; `axe` sem violações críticas; navegação completa por leitor de tela na árvore.

**Fase 7: Mobile, PWA e acabamento**
Lista em árvore no celular, bottom sheet, gestos, PWA instalável offline, onboarding (3 passos), ajuda de atalhos, documentação final.
*Aceite*: Lighthouse PWA/Acessibilidade/Performance ≥ 90; app funciona totalmente offline após a primeira visita; fluxo E2E mobile verde.

---

## 16. DEFINIÇÃO DE PRONTO (vale para cada fase e para a entrega final)

- [ ] Compila sem erros ou avisos; TypeScript strict; lint limpo.
- [ ] Todos os testes (unidade, componente, E2E) passam.
- [ ] Nenhum `TODO`, `console.log` ou código morto.
- [ ] Todos os estados (vazio, carregando, erro, sucesso) implementados e visíveis na UI.
- [ ] Nenhuma ação destrutiva sem desfazer ou confirmação.
- [ ] Atalhos documentados; acessibilidade verificada.
- [ ] `README.md` com instalação, scripts, arquitetura resumida e limitações conhecidas; `docs/DECISIONS.md` atualizado.

---

## 17. FORA DO ESCOPO DO MVP (não implementar, mas deixar a arquitetura preparada)

Contas e sincronização na nuvem, colaboração em tempo real, IA, publicação de páginas, anexos/imagens, histórico de versões completo por nota (apenas o stub de menu), plugins, aplicativos nativos.
Prepare o código para isso: camada `db/` com **interface de repositório** (trocável por um backend), IDs globais (ULID), `updatedAt` em tudo e soft delete (necessários para sincronizar depois).

---

## 18. COMO RESPONDER A CADA ETAPA

Ao terminar cada fase, responda com:
1. **Resumo** do que foi implementado (5 linhas no máximo).
2. **Como rodar** (comandos exatos).
3. **Resultado dos testes/build** (saída real).
4. **Decisões tomadas** e suposições (também em `DECISIONS.md`).
5. **Pendências ou riscos** conhecidos.
6. Pergunta final: "Posso seguir para a Fase N+1?"

**Comece agora pela Fase 1.**
