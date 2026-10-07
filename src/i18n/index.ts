import { ptBR, type Messages } from './pt-BR';

export type Locale = 'pt-BR';

const dictionaries: Record<Locale, Messages> = { 'pt-BR': ptBR };

let current: Locale = 'pt-BR';

export type MessageKey = DeepPaths<Messages>;

type DeepPaths<T> = T extends string
  ? never
  : {
      [K in keyof T & string]: T[K] extends string ? K : `${K}.${DeepPaths<T[K]>}`;
    }[keyof T & string];

export function setLocale(locale: Locale): void {
  current = locale;
}

export function getLocale(): Locale {
  return current;
}

export interface TranslateParams {
  [key: string]: string | number;
}

/** Texto visível ao usuário — sempre em pt-BR no MVP. */
export function t(key: MessageKey, params?: TranslateParams): string {
  const value = resolve(dictionaries[current], key.split('.'));
  if (typeof value !== 'string') {
    throw new Error(`Chave de i18n inexistente: ${key}`);
  }
  if (!params) return value;
  return value.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

function resolve(root: unknown, path: string[]): unknown {
  let cursor: unknown = root;
  for (const segment of path) {
    if (typeof cursor !== 'object' || cursor === null) return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}
