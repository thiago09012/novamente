export interface NoteColor {
  id: string;
  label: string;
  /** Cor fixa usada na borda esquerda do nó (decorativa, sempre com ícone/texto junto). */
  value: string;
}

/** Paleta de 8 cores (seção 5.8), válida nos dois temas. */
export const NOTE_COLORS: NoteColor[] = [
  { id: 'verde', label: 'Verde', value: '#22c55e' },
  { id: 'azul', label: 'Azul', value: '#3b82f6' },
  { id: 'roxo', label: 'Roxo', value: '#a855f7' },
  { id: 'rosa', label: 'Rosa', value: '#ec4899' },
  { id: 'vermelho', label: 'Vermelho', value: '#ef4444' },
  { id: 'laranja', label: 'Laranja', value: '#f97316' },
  { id: 'amarelo', label: 'Amarelo', value: '#eab308' },
  { id: 'turquesa', label: 'Turquesa', value: '#14b8a6' },
];

export function colorValue(id: string | null): string | null {
  return NOTE_COLORS.find((color) => color.id === id)?.value ?? null;
}
