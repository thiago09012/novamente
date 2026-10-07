export const MAX_TITLE_LENGTH = 200;
export const MAX_DEPTH = 50;
export const MAX_TAGS = 30;
export const MAX_TAG_LENGTH = 40;
/** Acima disso os irmãos são reindexados em transação. */
export const MAX_ORDER_KEY_LENGTH = 64;
/** Limite de itens no histórico de desfazer/refazer. */
export const HISTORY_LIMIT = 200;
/** Itens da lixeira são apagados definitivamente após 30 dias. */
export const TRASH_TTL_DAYS = 30;
/** Títulos exibidos no nó são truncados aqui (texto completo no tooltip). */
export const NODE_LABEL_MAX = 40;
/** Margem de culling do canvas. */
export const CULLING_MARGIN = 300;
export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 2.5;
/** Abaixo deste zoom os nós entram em modo simplificado (tooltip mostra o resto). */
export const ZOOM_LEGIBLE_MIN = 0.6;
export const DENSITY_NODE_PX = { comfortable: 44, compact: 36 } as const;
export const UI_SCALES = [1, 1.15, 1.3] as const;
