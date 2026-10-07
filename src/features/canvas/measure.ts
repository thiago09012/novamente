import type { MeasureText } from './layout';

/**
 * Medição de rótulos via Canvas 2D (mesma fonte do app) com cache.
 * `document.fonts.ready` dispara re-layout (a largura muda quando a Inter carrega).
 */

const cache = new Map<string, number>();

function cssVar(name: string): string {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function nodeFontSize(): number {
  const raw = cssVar('--node-font-size');
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 14;
}

export function nodeFontFamily(): string {
  const raw = cssVar('--font-sans');
  return raw || 'system-ui, sans-serif';
}

let context: CanvasRenderingContext2D | null = null;

function getContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!context) {
    context = document.createElement('canvas').getContext('2d');
  }
  return context;
}

/** Medidor padrão: largura do texto na fonte real do nó. */
export function createTextMeasure(fontSize = nodeFontSize()): MeasureText {
  const fontFamily = nodeFontFamily();
  const font = `500 ${fontSize}px ${fontFamily}`;
  const ctx = getContext();
  if (ctx) ctx.font = font;

  return (text: string) => {
    const key = `${font}|${text}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    let width: number;
    if (ctx) {
      width = Math.ceil(ctx.measureText(text).width);
    } else {
      // jsdom/ambiente sem canvas: estimativa estável (não usada em produção).
      width = Math.ceil(text.length * fontSize * 0.56);
    }
    cache.set(key, width);
    return width;
  };
}

/**
 * Estimativa deliberadamente alta para níveis com milhares de rótulos.
 * Evita milhares de chamadas síncronas ao Canvas 2D ao abrir árvores largas.
 */
export function createApproximateTextMeasure(fontSize = nodeFontSize()): MeasureText {
  return (text: string) => Math.ceil(text.length * fontSize * 0.9 + fontSize * 0.15);
}

/** Limpura o cache (troca de idioma/fonte; usada em testes). */
export function clearTextMeasureCache(): void {
  cache.clear();
}
