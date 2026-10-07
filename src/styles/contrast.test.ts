import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Teste de contraste dos tokens de cores (WCAG 2.1).
 * Roda em `npm run test:contrast` — que é `prebuild`, portanto quebra o build.
 *
 * - Texto (corpo, títulos, rótulos): mínimo 4.5:1 (AA).
 * - Componentes de UI (bordas de foco, acento, perigo): mínimo 3:1 (AA non-text).
 * - Rótulos sobre preenchimento de acento (ex.: botão primário branco sobre azul):
 *   mínimo 3:1 — controles semibold, não texto de corpo (prática Apple HIG).
 * - Tokens translúcidos (rgba) são compostos sobre `--bg-app` do tema antes de medir.
 * - Hairlines (`--border`, `--border-strong`) são decorativas — nunca carregam
 *   informação sozinhas (sempre com cor/fundo) — e por isso ficam fora dos pares.
 */

const tokensPath = resolve(process.cwd(), 'src/styles/tokens.css');
const css = readFileSync(tokensPath, 'utf8');

function parseBlock(selector: string): Record<string, string> {
  const index = css.indexOf(selector);
  if (index < 0) throw new Error(`Seletor não encontrado em tokens.css: ${selector}`);
  const start = css.indexOf('{', index);
  const end = css.indexOf('}', start);
  const body = css.slice(start + 1, end);
  const vars: Record<string, string> = {};
  for (const line of body.split(';')) {
    const match = line.match(/(--[\w-]+)\s*:\s*([^;]+)/);
    if (match) vars[match[1]] = match[2].trim();
  }
  return vars;
}

const dark = parseBlock(':root');
const light = parseBlock("[data-theme='light']");

type Theme = Record<string, string>;

type Rgb = [number, number, number];

function parseColor(value: string): { rgb: Rgb; alpha: number } {
  const hex = value.trim().match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hex) return { rgb: hexToRgb(`#${hex[1]}`), alpha: 1 };
  const rgba = value
    .trim()
    .match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (!rgba) throw new Error(`Cor inválida nos tokens: ${value}`);
  const rgb = [rgba[1], rgba[2], rgba[3]].map((part) => Number(part) / 255) as Rgb;
  if (rgb.some((part) => !Number.isFinite(part) || part < 0 || part > 1)) {
    throw new Error(`Cor inválida nos tokens: ${value}`);
  }
  const alpha = rgba[4] === undefined ? 1 : Number(rgba[4]);
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
    throw new Error(`Cor inválida nos tokens: ${value}`);
  }
  return { rgb, alpha };
}

/** Compõe um token (possivelmente translúcido) sobre o fundo do app do tema. */
function resolveRgb(token: string, theme: Theme): Rgb {
  const { rgb, alpha } = parseColor(token);
  if (alpha >= 1) return rgb;
  const base = parseColor(theme['--bg-app']).rgb;
  return rgb.map(
    (part, index) => Math.round((part * alpha + base[index] * (1 - alpha)) * 255) / 255,
  ) as Rgb;
}

function hexToRgb(hex: string): [number, number, number] {
  let value = hex.replace('#', '').trim();
  if (value.length === 3) value = value.replace(/./g, (c) => c + c);
  if (!/^[0-9a-fA-F]{6}$/.test(value)) throw new Error(`Cor inválida nos tokens: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

function relativeLuminance(color: Rgb): number {
  const [r, g, b] = color.map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(hexToRgb(a));
  const lb = relativeLuminance(hexToRgb(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Contraste entre dois tokens do tema (compõe translúcidos sobre --bg-app). */
export function themeContrastRatio(fg: string, bg: string, theme: Theme): number {
  const la = relativeLuminance(resolveRgb(fg, theme));
  const lb = relativeLuminance(resolveRgb(bg, theme));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = ['--bg-app', '--bg-sidebar', '--bg-editor', '--bg-node'] as const;

/** [token de frente, token de fundo, mínimo] */
const TEXT_PAIRS: Array<[string, string, number]> = [];
for (const fg of ['--text', '--text-muted', '--link', '--danger', '--warning']) {
  for (const bg of SURFACES) TEXT_PAIRS.push([fg, bg, 4.5]);
}
/* `--accent-bg` é lavagem sutil para linhas selecionadas (texto ink por cima),
 * nunca base para texto branco — texto branco só vai sobre preenchimento de
 * acento sólido, coberto por ACCENT_LABEL_PAIRS. Por isso não há par aqui. */

/** Rótulos sobre preenchimento de acento: controles, não corpo (mínimo 3:1). */
const ACCENT_LABEL_PAIRS: Array<[string, string, number]> = [
  ['--text-on-accent-button', '--accent', 3],
];

const UI_PAIRS: Array<[string, string, number]> = [];
for (const fg of ['--accent', '--danger', '--focus']) {
  for (const bg of SURFACES) UI_PAIRS.push([fg, bg, 3]);
}

const THEMES: Array<[string, Theme]> = [
  ['escuro', dark],
  ['claro', light],
];

describe('tokens de cor — contraste WCAG AA', () => {
  it('os dois temas definem os mesmos tokens de cor', () => {
    const colorVarsDark = Object.keys(dark).filter((k) => dark[k].startsWith('#'));
    const colorVarsLight = Object.keys(light).filter((k) => light[k].startsWith('#'));
    expect(colorVarsLight.sort()).toEqual(colorVarsDark.sort());
  });

  for (const [themeName, theme] of THEMES) {
    describe(`tema ${themeName}`, () => {
      for (const [fg, bg, min] of [...TEXT_PAIRS, ...ACCENT_LABEL_PAIRS]) {
        it(`${fg} sobre ${bg} ≥ ${min}:1`, () => {
          expect(themeContrastRatio(theme[fg], theme[bg], theme)).toBeGreaterThanOrEqual(min);
        });
      }
      for (const [fg, bg, min] of UI_PAIRS) {
        it(`${fg} (componente) sobre ${bg} ≥ ${min}:1`, () => {
          expect(themeContrastRatio(theme[fg], theme[bg], theme)).toBeGreaterThanOrEqual(min);
        });
      }
    });
  }
});
