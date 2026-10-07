# SHORTCUTS — atalhos de teclado

Documentação exigida pela seção 6 do prompt; a tela de ajuda (`Ajuda e atalhos`)
exibe **somente o que já está implementado** e é atualizada a cada fase.

## Implementados (Fases 1–5, parcial)

| Tecla | Contexto | Ação |
|---|---|---|
| `Enter` | renomear inline (sidebar) | confirma o novo nome |
| `Esc` | renomear inline (sidebar) | cancela e restaura o nome anterior |
| `F2` | item da sidebar com foco | inicia renomear inline |
| `Duplo clique` | item da sidebar | renomear inline |
| `Esc` | diálogo / menu | fecha (e devolve o foco ao gatilho) |
| `↑` `↓` `Home` `End` | menu de contexto | navega entre itens |
| `Tab` / `Shift+Tab` | diálogo | ciclo de foco preso ao painel |
| Botão direito / pressão longa `500 ms` | item da sidebar | abre menu de contexto |
| `Tab` | botão com foco | ativa (comportamento nativo) |
| `↑` `↓` | nó focado | nó anterior/seguinte entre irmãos visíveis |
| `←` | nó focado | recolhe o ramo; se já recolhido, move o foco ao pai |
| `→` | nó focado | expande o ramo; se já expandido, move o foco ao primeiro filho |
| `Enter` | nó focado | cria irmão e inicia renomear |
| `Tab` | nó focado | cria filho e inicia renomear |
| `Tab` | renomear nó | confirma o nome e cria um filho |
| `Espaço` | nó focado com filhos | expande/recolhe o ramo |
| `F2` / duplo clique | nó focado / nó | inicia renomear inline |
| `Esc` | árvore com seleção | limpa a seleção |
| `Ctrl/⌘+Z` | canvas, fora de campos editáveis | desfaz a última ação estrutural registrada |
| `Ctrl/⌘+Shift+Z` / `Ctrl+Y` | canvas, fora de campos editáveis | refaz a ação estrutural |
| `Shift+Tab` | nó focado | promove para o nível do pai |
| `Alt+↑` / `Alt+↓` | nó focado | reordena entre irmãos |
| `Delete` / `Backspace` | nó focado | move nota ou seleção para a lixeira |
| `Ctrl/⌘+D` | nó focado | duplica com subnotas |
| `E` | nó focado | foca o título no editor |
| `Ctrl/⌘+Shift+N` | global, fora de campos editáveis | nova categoria |
| `Ctrl/⌘+N` | global, fora de campos editáveis | nova nota na categoria ativa |
| `Ctrl/⌘+K` | global, fora de campos editáveis | abre busca e comandos |
| `Ctrl/⌘+B` | global, fora de campos editáveis | recolher/expandir barra lateral |
| `Ctrl/⌘+\\` | global, fora de campos editáveis | recolher/abrir editor |
| `Ctrl/⌘+/` | global, fora de campos editáveis | ajuda e atalhos |

## Previstos (com fase)

### Fase 2 — árvore (implementada)

| Tecla | Ação |
|---|---|
| `↑` `↓` | nó anterior/seguinte entre irmãos visíveis |
| `←` | recolhe; se recolhido, vai ao pai |
| `→` | expande; se expandido, vai ao primeiro filho |
| `Enter` | novo irmão abaixo (entra em renomear) |
| `Tab` | novo filho (entra em renomear) |
| `Espaço` | expandir/recolher |

### Fase 4 — teclado completo, arrastar e histórico

| Tecla | Ação |
|---|---|
| `Esc` | cancela / limpa seleção / sai do modo foco |

### Fase 5 — busca e foco

| Tecla | Ação |
|---|---|
| `Ctrl/⌘+0` | centralizar a árvore |
| `Ctrl/⌘+1` | ajustar à tela |

**Regras gerais** (seção 6): atalhos de nó não disparam enquanto o usuário digita
em campo de texto/editor; `⌘` no macOS e `Ctrl` nos demais; nunca sequestrar
atalhos do navegador sem necessidade.
