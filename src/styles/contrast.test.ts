import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Teste de contraste dos tokens de cores (WCAG 2.1).
 * Roda em `npm run test:contrast` — que é `prebuild`, portanto quebra o build.
 *
 * - Texto (corpo, títulos, rótulos): mínimo 4.5:1 (AA).
 * - Componentes de UI (bordas de foco, acento, perigo): mínimo 3:1 (AA non-text).
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

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = ['--bg-app', '--bg-sidebar', '--bg-editor', '--bg-node'] as const;

/** [token de frente, token de fundo, mínimo] */
const TEXT_PAIRS: Array<[string, string, number]> = [];
for (const fg of ['--text', '--text-muted', '--link', '--danger', '--warning']) {
  for (const bg of SURFACES) TEXT_PAIRS.push([fg, bg, 4.5]);
}
TEXT_PAIRS.push(['--text-on-accent', '--accent-bg', 4.5]);
TEXT_PAIRS.push(['--text-on-accent-button', '--accent', 4.5]);

const UI_PAIRS: Array<[string, string, number]> = [];
for (const fg of ['--accent', '--border-strong', '--danger', '--focus']) {
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
      for (const [fg, bg, min] of TEXT_PAIRS) {
        it(`${fg} sobre ${bg} ≥ ${min}:1`, () => {
          expect(contrastRatio(theme[fg], theme[bg])).toBeGreaterThanOrEqual(min);
        });
      }
      for (const [fg, bg, min] of UI_PAIRS) {
        it(`${fg} (componente) sobre ${bg} ≥ ${min}:1`, () => {
          expect(contrastRatio(theme[fg], theme[bg])).toBeGreaterThanOrEqual(min);
        });
      }
    });
  }
});
