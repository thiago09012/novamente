# Briefing: Redesign de Identidade Visual — Novamente

> Contexto para especialista em UI. Enviar junto com o print atual do app.
> A spec detalhada "Apple Neural" vive na nota do vault: `Novamente / Design Spec · Apple Neural`.

## 1. Sobre o projeto

O **Novamente** é um aplicativo de notas local-first (second brain / PKM) voltado para conectar ideias e organizar conhecimento em rede. Ajuda pessoas a pensarem de forma estruturada, sem perder o contexto entre conceitos relacionados.

O nome "Novamente" carrega a ideia de revisitar e reconectar pensamentos: o conhecimento cresce quando voltamos às notas e criamos novas ligações entre elas.

- **Nome atual:** Novamente (não usar mais "Neuronow")
- **Posicionamento:** Second Brain / Zettelkasten com visualização em grafo
- **Filosofia:** Local-first, aberto, minimalista e pensado para produtividade
- **Status:** Projeto open-source (MIT License)

## 2. URLs e referências

- **Aplicação em produção:** https://novamente-smoky.vercel.app
- **Repositório GitHub:** https://github.com/thiago09012/novamente
- **README (inglês):** https://github.com/thiago09012/novamente#readme
- **README (português):** https://github.com/thiago09012/novamente/blob/main/README.pt-BR.md
- **Screenshots atuais:**
  - Editor: `docs/images/editor.png`
  - Canvas (árvore/grafo): `docs/images/canvas.png`

O print enviado é o estado atual da interface e deve servir como base para o mockup proposto.

## 3. Problema que resolve

Muitas ferramentas de anotações ou são muito lineares (pastas) ou muito abstratas (grafos sem hierarquia). O Novamente busca o meio-termo: permite **organizar com hierarquia (árvore/categorias)** e, ao mesmo tempo, **visualizar conexões entre notas (canvas + wikilinks `[[...]]`)**.

Diferenciais principais:

- **Hierarquia + grafo coexistem.** As notas vivem em uma árvore organizada por categorias, mas também se conectam entre si via wikilinks.
- **Focado em conexão de ideias.** O canvas mostra visualmente essas ligações (arestas entre nós), reforçando o conceito de "rede de conhecimento".
- **Pronto para IA.** Compatível com Obsidian (sincroniza com pasta Markdown), exporta "Contexto do Projeto" limpo para IA e possui servidor MCP próprio.
- **100% local-first.** Todos os dados ficam no IndexedDB (Dexie). Sem backend obrigatório, sem tracking, sem lock-in.
- **Pensado para trabalho em sessões longas.** Interface estável, com foco em leitura e escrita.

## 4. Público-alvo

- **Pesquisadores, estudantes e autodidatas** que constroem conhecimento ao longo do tempo (Zettelkasten, Evergreen Notes)
- **Criadores de conteúdo** (escritores, roteiristas) que precisam conectar temas e referências
- **Desenvolvedores e técnicos** que documentam projetos complexos com múltiplas ramificações
- **Pessoas com pensamento não-linear** (brain dump → organização → conexão)

## 5. Stack e restrições técnicas

A identidade visual precisa funcionar dentro das limitações atuais (sem quebrar acessibilidade ou tokens existentes):

- **Frontend:** React 18 + TypeScript (strict) + Vite
- **Estado:** Zustand
- **Banco local:** Dexie/IndexedDB
- **Editor rico:** TipTap 3 (com suporte a wikilinks, listas, títulos, citações, código)
- **Estilos:** Tailwind CSS v4 (usa tokens CSS nativos, não apenas classes utilitárias)
- **Design system:** Componentes próprios (Dialog, Button, Icon etc.)
- **Idioma UI:** Português do Brasil (pt-BR)
- **Acessibilidade:** Contraste mínimo WCAG AA (há teste automatizado `src/styles/contrast.test.ts` que roda no build — **obrigatório**)
- **Tema:** Suporta Dark, Light e System. Atualmente é **dark-first** por padrão.

## 6. Arquitetura de interface (áreas principais)

A interface é dividida em 3 áreas principais, visíveis no print:

1. **Barra lateral (esquerda)** — Lista de categorias (raízes da árvore). Controla qual projeto/ramo está ativo.
2. **Canvas (centro)** — Visualização em árvore/organograma com nós (notas). É o coração do conceito "conexões". Mostra arestas entre notas vinculadas (`[[wikilinks]]`). Por padrão, essas arestas já aparecem ativadas (`showLinkEdges: true`).
3. **Painel lateral/direito (Editor)** — Editor de notas com TipTap, backlinks, tags, metadados e subnotas. Focado em leitura/escrita.

Há também busca global (Cmd/Ctrl+K), modo leitura, minimapa no canvas e foco em ramos.

## 7. Direção de design desejada

O objetivo não é modernizar por modismo, mas **reforçar a identidade conceitual (rede de pensamento + conhecimento conectado)** com uma UI mais coesa e profissional, pronta para apresentação como projeto open-source.

### Tom e personalidade

- **Sério, limpo e produtivo.** Transmite confiança (ferramenta para pensamento de longo prazo)
- **Minimalista sem ser frio.** Deve ser "aconchegante" para uso diário, não burocrático
- **Tecnológico e orgânico ao mesmo tempo.** Mistura precisão (linhas, estrutura) com o conceito orgânico de conexões (nós, ramificações, fluxos)
- **Focado no conteúdo.** UI deve sumir, dar destaque ao texto e às conexões entre ideias

### Estilo sugerido

- **"Apple Neural": conteúdo primeiro, profundidade por material (vidro fosco + hairlines + sombras multicamada), conectividade como identidade.** Ver a nota `Design Spec · Apple Neural` no vault para tokens exatos.
- **Dark-first com bom contraste.** Manter dark como experiência primária, mas polir light com a mesma coerência.
- **Tipografia com foco em legibilidade.** Editor precisa de leitura confortável (corpo + títulos h1–h3 bem hierarquizados). UI pode ser mais compacta/geométrica.
- **Elementos gráficos sutis.** Linhas/arestas (links entre notas) são parte da identidade — destacar essas conexões visualmente sem poluir o canvas.

## 8. Paleta, espaçamentos e tokens

Atualmente usa variáveis CSS (Tailwind v4). O redesign pode propor **tokens semânticos** (bg-app, bg-surface, border, accent, text, muted etc.) para facilitar dark/light de forma consistente. A proposta "Apple Neural" já define esses tokens — usá-la como base.

**Pontos de atenção:**

- **Accent (destaques):** Usado em botões ativos, links, switch, status. Deve ter bom contraste em dark e light.
- **Superfícies:** Canvas, sidebar, editor precisam ter fundos com hierarquia clara (sem "fundos colados" sem distinção).
- **Bordas:** Atualmente sutis. Ganhar mais consistência (hairlines 0.5px, nunca bordas opacas 1px).
- **Ícones:** Estilo clean (line-based). Manter legíveis em tamanhos pequenos.
- **Espaçamentos:** Basear em escala rítmica (4/8pt). Preservar densidade "confortável/compacto" existente.

## 9. Entrega esperada

1. **Proposta de identidade visual (brand direction)**
   - Paleta de cores (primária/acento + neutros + feedback: sucesso/alerta/perigo) com sugestões para **Dark** e **Light**
   - Tipografia sugerida (famílias para UI + para editor/leitura), com justificativa breve de legibilidade
   - Border-radius, espaçamentos, elevações (shadows), tokens semânticos sugeridos
   - Sugestões de ícones (estilo + direção)
   - Moodboard conceitual (referências visuais + palavras-chave: connected, structured, calm, focused)

2. **Mockup a partir do print**
   - Pelo menos **1 mockup desktop** (preferencial 1440–1920px) com base fiel na estrutura atual (Sidebar + Canvas + Editor), aplicando a nova identidade
   - Mostrar o **estado principal** (canvas com nós + arestas visíveis, categoria ativa, nota selecionada no editor)
   - Opcional: variações Dark/Light, ou pelo menos Dark (ponto forte atual)

3. **Rationale breve**
   - Explicar 2–3 decisões principais (como reforçam o conceito "conhecimento conectado")
   - Sugestões práticas de aplicação (o que priorizar na primeira iteração vs. evoluções futuras)

## 10. Diretrizes para não fugir do propósito

- **Preservar clareza acima de decoração.** Ferramenta de pensamento, não landing page promocional.
- **Reforçar conectividade.** As arestas/wikilinks devem ser um elemento visual reconhecível da identidade (não esconder, destacar com intenção).
- **Manter acessibilidade WCAG AA.** Qualquer proposta de cores precisa validar contraste (checamos com os testes existentes).
- **Respeitar pt-BR e densidades existentes.** Não quebrar a experiência atual de uso prolongado.
- **Evolutivo, não disruptivo.** Dar mais coesão e personalidade, elevando o que já existe — sem reinventar a UX por completo.

## Objetivo final

Ter uma **nova identidade visual coerente** que comunique visualmente o conceito do Novamente (conhecimento conectado, estruturado e local-first), aplicada em um **mockup atualizado** a partir do print enviado. Isso permite evoluir a UI com segurança, mantendo a proposta original e preparando o projeto para ganhar visibilidade como open-source.
