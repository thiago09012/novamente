import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { App } from '@/app/App';

vi.mock('@/db/bootstrap', () => ({
  openAppDatabase: () =>
    Promise.resolve({
      db: {},
      repos: {},
      migration: { applied: [], from: 1, to: 1 },
      seededExample: false,
      memoryOnly: false,
    }),
  StorageUnavailableError: class StorageUnavailableError extends Error {},
}));

vi.mock('@/app/runtime', async () => {
  const { defaultSettings } = await import('@/domain/settings');
  const base = defaultSettings();
  const notesList = [
    {
      id: 'c1',
      parentId: null,
      orderKey: 'a1',
      title: 'Comida',
      icon: 'folder',
      color: null,
      content: { type: 'doc', content: [] },
      contentText: '',
      tags: [],
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
      deletedRootId: null,
    },
    {
      id: 'c2',
      parentId: null,
      orderKey: 'a2',
      title: 'Bebidas',
      icon: 'folder',
      color: null,
      content: { type: 'doc', content: [] },
      contentText: '',
      tags: [],
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
      deletedRootId: null,
    },
    {
      id: 'n1',
      parentId: 'c1',
      orderKey: 'a0',
      title: 'Feijoada',
      icon: 'circle',
      color: null,
      content: { type: 'doc', content: [] },
      contentText: '',
      tags: [],
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
      deletedRootId: null,
    },
    {
      id: 'd1',
      parentId: 'c2',
      orderKey: 'a0',
      title: 'Podre',
      icon: 'circle',
      color: null,
      content: { type: 'doc', content: [] },
      contentText: '',
      tags: [],
      createdAt: 1,
      updatedAt: 1,
      deletedAt: 2,
      deletedRootId: 'd1',
    },
  ];
  return {
    setRuntime: () => undefined,
    hasRuntime: () => true,
    runtime: () => ({
      repos: {
        notes: {
          getAll: () => Promise.resolve(notesList),
          get: (id: string) => Promise.resolve(notesList.find((n) => n.id === id)),
          put: () => Promise.resolve(),
          putMany: () => Promise.resolve(),
          applyChanges: () => Promise.resolve(),
          saveContent: () => Promise.resolve(),
          remove: () => Promise.resolve(),
          count: () => Promise.resolve(notesList.length),
        },
        links: {
          getAll: () => Promise.resolve([]),
          getByFrom: () => Promise.resolve([]),
          getByTo: () => Promise.resolve([]),
          replaceFrom: () => Promise.resolve(),
        },
        settings: {
          get: () => Promise.resolve({ ...base, lastCategoryId: 'c1' }),
          set: (patch: Record<string, unknown>) => Promise.resolve({ ...base, ...patch }),
        },
        views: { getAll: () => Promise.resolve([]), replaceAll: () => Promise.resolve() },
        meta: {
          get: () => Promise.resolve(undefined),
          set: () => Promise.resolve(),
          getAll: () => Promise.resolve({}),
        },
      },
    }),
  };
});

describe('App (Fase 1)', () => {
  it('renderiza sidebar com categorias, canvas e rodapé', async () => {
    render(<App />);

    expect((await screen.findAllByText('Comida')).length).toBeGreaterThan(0);
    expect(screen.getByText('Bebidas')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Buscar notas' })).toHaveLength(1);
    // canvas + editor expõem cabeçalho (banner)
    expect((await screen.findAllByRole('banner')).length).toBeGreaterThan(0);
    // contagem da árvore da categoria ativa (Comida tem 1 descendente)
    expect(await screen.findByText('1 nota aqui')).toBeInTheDocument();
    // ações do rodapé
    expect(screen.getByRole('button', { name: 'Abrir lixeira' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir configurações' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajuda e atalhos' })).not.toBeInTheDocument();
  });

  it('cria categoria e entra em renomeação inline', async () => {
    render(<App />);
    const create = await screen.findByRole('button', { name: 'Nova categoria' });
    fireEvent.click(create);

    const input = await screen.findByPlaceholderText('Nome da categoria');
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'Livros' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect((await screen.findAllByText('Livros')).length).toBeGreaterThan(0);
  });

  it('abre a lixeira com o grupo excluído (sem loop de render)', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir lixeira' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Lixeira');
    expect(dialog).toHaveTextContent('Podre');
    expect(dialog).toHaveTextContent('1 notas excluídas');
    // restaurar devolve a nota viva
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar' }));
    expect(await screen.findByText(/restaurada/i)).toBeInTheDocument();
  });

  it('abre diálogo de configurações pelo rodapé', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir configurações' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Configurações');
    expect(dialog).toHaveTextContent('Aparência');
    expect(screen.getByRole('radio', { name: /Escuro/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('mantém ajuda e atalhos dentro das configurações', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir configurações' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ajuda e atalhos' }));

    expect((await screen.findAllByText('Navegação')).length).toBeGreaterThan(1);
    expect(screen.getByText('Árvore (canvas)')).toBeInTheDocument();
  });
});
