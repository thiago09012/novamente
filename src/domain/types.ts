/** Identificador global (ULID). */
export type ID = string;

/** Nó do documento rico (estruturalmente compatível com JSONContent do TipTap). */
export interface NoteContentNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: NoteContentNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
}

/** Nota: uma categoria é uma nota com parentId === null. */
export interface Note {
  id: ID;
  parentId: ID | null;
  /** Índice fracionário: ordem entre irmãos. */
  orderKey: string;
  /** Pode ser vazio; a UI exibe "Sem título". */
  title: string;
  content: NoteContentNode;
  /** Texto puro derivado do conteúdo, usado na busca. */
  contentText: string;
  /** Nome de ícone lucide. */
  icon: string;
  /** Token de cor da paleta ou null. */
  color: string | null;
  /** Minúsculas, sem '#', únicas. */
  tags: string[];
  createdAt: number;
  updatedAt: number;
  /** Soft delete (lixeira). */
  deletedAt: number | null;
  /** Id da nota que originou a exclusão em cascata. */
  deletedRootId: ID | null;
}

/** Link derivado do conteúdo, reconstruído ao salvar a nota. */
export interface Link {
  id: ID;
  fromId: ID;
  /** null = link não resolvido (nota inexistente). */
  toId: ID | null;
  /** Texto original, para links não resolvidos. */
  toTitle: string;
}

/** Estado de navegação por categoria. Nunca entra no histórico de undo. */
export interface ViewState {
  rootId: ID;
  expanded: Record<ID, boolean>;
  panX: number;
  panY: number;
  zoom: number;
  selectedId: ID | null;
}

export type ThemeSetting = 'dark' | 'light' | 'system';
export type ReducedMotion = 'system' | 'on' | 'off';
export type Density = 'comfortable' | 'compact';
export type UiScale = 1 | 1.15 | 1.3;

export interface Settings {
  theme: ThemeSetting;
  showLinkEdges: boolean;
  sidebarCollapsed: boolean;
  editorWidth: number;
  editorOpen: boolean;
  reducedMotion: ReducedMotion;
  lastCategoryId: ID | null;
  schemaVersion: number;
  /** Confortável: 44 px (padrão). Compacto: 36 px. */
  density: Density;
  /** Escala tipográfica da UI; alimenta o cálculo de layout da árvore. */
  uiScale: UiScale;
  /** Remove acentos ao normalizar tags (opcional). */
  tagStripAccents: boolean;
}

/** Estado persistido da árvore de uma categoria. */
export interface ViewRecord {
  rootId: ID;
  expanded: Record<ID, boolean>;
  panX: number;
  panY: number;
  zoom: number;
  selectedId: ID | null;
}
