import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import { generateNKeysBetween } from 'fractional-indexing';
import { ulid } from 'ulid';
import { expect, test } from './fixtures';
import { originalPositionFor, TraceMap, type SourceMapInput } from '@jridgewell/trace-mapping';

import { EMPTY_DOC } from '../src/domain/content';
import type { Note } from '../src/domain/types';

const TOTAL_NOTES = 5000;
const LOAD_TARGET_MS = 200;
const RUN_MS = 1200;

test('mede abertura e pan do canvas com 5.000 notas', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    const observer = new PerformanceObserver((list) => {
      const previous = JSON.parse(sessionStorage.getItem('mente-long-tasks') ?? '[]') as Array<{
        startTime: number;
        duration: number;
      }>;
      const entries = list.getEntries().map((entry) => ({
        startTime: entry.startTime,
        duration: entry.duration,
      }));
      sessionStorage.setItem('mente-long-tasks', JSON.stringify([...previous, ...entries]));
    });
    observer.observe({ type: 'longtask', buffered: true });
  });
  await page.goto('/');
  await expect(page.getByRole('tree', { name: 'Árvore de notas' })).toBeVisible();

  const now = Date.now();
  const rootId = ulid();
  const emptyRootId = ulid();
  const childCount = TOTAL_NOTES - 2;
  const orderKeys = generateNKeysBetween(null, null, childCount);
  const children: Note[] = Array.from({ length: childCount }, (_, index) => ({
    id: ulid(),
    parentId: rootId,
    orderKey: orderKeys[index],
    title: `Nota de carga ${index + 1}`,
    content: EMPTY_DOC,
    contentText: '',
    icon: 'circle',
    color: null,
    tags: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deletedRootId: null,
  }));
  const notes: Note[] = [
    {
      id: rootId,
      parentId: null,
      orderKey: 'a0',
      title: 'Carga de desempenho',
      content: EMPTY_DOC,
      contentText: '',
      icon: 'folder',
      color: null,
      tags: [],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      deletedRootId: null,
    },
    {
      id: emptyRootId,
      parentId: null,
      orderKey: 'a1',
      title: 'Categoria vazia',
      content: EMPTY_DOC,
      contentText: '',
      icon: 'folder',
      color: null,
      tags: [],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      deletedRootId: null,
    },
    ...children,
  ];

  await page.evaluate(
    async ({ stressNotes, activeRootId }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('mente');
        request.onerror = () => reject(new Error(request.error?.message ?? 'Falha ao abrir o banco'));
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['notes', 'links', 'settings', 'views'], 'readwrite');
          tx.objectStore('notes').clear();
          tx.objectStore('links').clear();
          for (const note of stressNotes) tx.objectStore('notes').put(note);
          const settings = tx.objectStore('settings');
          const getSettings = settings.get('app');
          getSettings.onsuccess = () => {
            settings.put({ ...getSettings.result, key: 'app', lastCategoryId: activeRootId });
          };
          tx.objectStore('views').put({
            rootId: activeRootId,
            expanded: {},
            panX: 48,
            panY: 48,
            zoom: 1,
            selectedId: null,
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(new Error(tx.error?.message ?? 'Falha ao gravar o seed'));
        };
      }),
    { stressNotes: notes, activeRootId: emptyRootId },
  );

  await page.reload();
  await expect(page.getByRole('button', { name: /^Carga de desempenho/ })).toBeVisible();
  await page.evaluate(() => {
    sessionStorage.setItem('mente-long-tasks', '[]');
    sessionStorage.setItem('mente-perf-phases', '1');
    performance.clearMeasures();
  });
  const profiler = process.env.PERF_PROFILE === '1' ? await page.context().newCDPSession(page) : null;
  if (profiler) {
    await profiler.send('Profiler.enable');
    await profiler.send('Profiler.start');
  }
  await page.evaluate(() => performance.mark('mente-open-category-start'));
  await page.getByRole('button', { name: /^Carga de desempenho/ }).click();
  await page.waitForFunction(
    (expected) =>
      document.querySelector('[data-testid="canvas"] header')?.textContent?.includes(expected) ??
      false,
    `${childCount} notas aqui`,
  );
  const openMs = await page.evaluate(() => {
    const start = performance.getEntriesByName('mente-open-category-start').at(-1)?.startTime ?? 0;
    return performance.now() - start;
  });
  const openLongTasks = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem('mente-long-tasks') ?? '[]') as Array<{startTime: number; duration: number}>,
  );
  const phaseMeasures = await page.evaluate(() =>
    performance
      .getEntriesByType('measure')
      .filter((entry) => entry.name.startsWith('mente:'))
      .map((entry) => ({ name: entry.name, milliseconds: entry.duration })),
  );
  const cpuProfile: Array<{ functionName: string; url: string; milliseconds: number }> = [];
  const cpuHotPaths: Array<{
    functionName: string;
    source: string | null;
    line: number | null;
    milliseconds: number;
    stack: string[];
  }> = [];
  if (profiler) {
    const { profile } = await profiler.send('Profiler.stop');
    await profiler.send('Profiler.disable');
    const profileTimeByNode = new Map<number, number>();
    profile.samples?.forEach((nodeId, index) => {
      profileTimeByNode.set(
        nodeId,
        (profileTimeByNode.get(nodeId) ?? 0) + (profile.timeDeltas?.[index] ?? 0),
      );
    });
    const profileNodesById = new Map(profile.nodes.map((node) => [node.id, node.callFrame]));
    const profileNodes = new Map(profile.nodes.map((node) => [node.id, node]));
    const parentById = new Map<number, number>();
    for (const node of profile.nodes) {
      for (const childId of node.children ?? []) parentById.set(childId, node.id);
    }
    cpuProfile.push(
      ...[...profileTimeByNode.entries()]
        .map(([nodeId, microseconds]) => ({
          functionName: profileNodesById.get(nodeId)?.functionName ?? '(anonymous)',
          url: profileNodesById.get(nodeId)?.url ?? '',
          milliseconds: microseconds / 1000,
        }))
        .sort((a, b) => b.milliseconds - a.milliseconds)
        .slice(0, 15),
    );
    const selfTimeMs = profileTimeByNode;
    const inclusiveCache = new Map<number, number>();
    const inclusive = (id: number): number => {
      const cached = inclusiveCache.get(id);
      if (cached !== undefined) return cached;
      const node = profileNodes.get(id);
      const total = (selfTimeMs.get(id) ?? 0) +
        (node?.children ?? []).reduce((sum, childId) => sum + inclusive(childId), 0);
      inclusiveCache.set(id, total);
      return total;
    };
    const candidates = profile.nodes
      .map((node) => ({ node, milliseconds: inclusive(node.id) / 1000 }))
      .filter(({ node, milliseconds }) => node.callFrame.url && milliseconds >= 1)
      .sort((a, b) => b.milliseconds - a.milliseconds)
      .slice(0, 25);
    const maps = new Map<string, TraceMap>();
    for (const { node, milliseconds } of candidates) {
      const frame = node.callFrame;
      let mapped: { source: string | null; line: number | null; name: string | null } = {
        source: null,
        line: null,
        name: null,
      };
      if (frame.url) {
        try {
          let sourceMap = maps.get(frame.url);
          if (!sourceMap) {
            const file = basename(new URL(frame.url).pathname);
            sourceMap = new TraceMap(
              JSON.parse(await readFile(resolve(process.cwd(), 'dist/assets', `${file}.map`), 'utf8')) as SourceMapInput,
            );
            maps.set(frame.url, sourceMap);
          }
          mapped = originalPositionFor(sourceMap, {
            line: frame.lineNumber + 1,
            column: frame.columnNumber,
          });
        } catch {
          // A source map is diagnostic metadata; keep the raw CPU profile usable without it.
        }
      }
      const stack: string[] = [];
      let current: number | undefined = node.id;
      while (current !== undefined) {
        const callFrame = profileNodes.get(current)?.callFrame;
        if (callFrame) stack.unshift(callFrame.functionName || '(anonymous)');
        current = parentById.get(current);
      }
      cpuHotPaths.push({
        functionName: mapped.name ?? frame.functionName,
        source: mapped.source,
        line: mapped.line,
        milliseconds,
        stack,
      });
    }
  }

  const frameStats = await page.evaluate(async (runMs) => {
    const viewport = document.querySelector<HTMLElement>('[data-canvas-viewport]');
    if (!viewport) throw new Error('Canvas viewport not found');
    const canvasViewport = viewport;
    const rect = canvasViewport.getBoundingClientRect();
    const gaps: number[] = [];
    const started = performance.now();
    let previous = started;

    await new Promise<void>((resolve) => {
      function frame(now: number) {
        gaps.push(now - previous);
        previous = now;
        if (now - started < runMs) {
          canvasViewport.dispatchEvent(
            new WheelEvent('wheel', {
              bubbles: true,
              cancelable: true,
              clientX: rect.left + rect.width / 2,
              clientY: rect.top + rect.height / 2,
              deltaY: 12,
            }),
          );
          requestAnimationFrame(frame);
        } else {
          resolve();
        }
      }
      requestAnimationFrame(frame);
    });

    const sorted = [...gaps].sort((a, b) => a - b);
    const averageFrameMs = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    return {
      frames: gaps.length,
      averageFrameMs,
      p95FrameMs: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
      estimatedFps: (gaps.length * 1000) / (previous - started),
    };
  }, RUN_MS);

  await page.keyboard.press('Control+k');
  const searchInput = page.getByRole('textbox', { name: 'Buscar por título, tag ou conteúdo…' });
  await expect(searchInput).toBeVisible();
  await searchInput.fill('carga');
  await expect(page.getByRole('option', { name: /Abrir nota Nota de carga/ }).first()).toBeVisible();
  const searchMeasures = await page.evaluate(() => {
    const lastMeasure = (name: string) =>
      performance.getEntriesByName(name).at(-1)?.duration ?? null;
    return {
      indexBuildMs: lastMeasure('mente:search-index'),
      queryMs: lastMeasure('mente:search-query'),
    };
  });

  const report = {
    totalNotes: TOTAL_NOTES,
    openMs,
    openTargetMs: LOAD_TARGET_MS,
    openTargetMet: openMs < LOAD_TARGET_MS,
    openLongTasks,
    phaseMeasures,
    cpuProfile,
    cpuHotPaths,
    pan: frameStats,
    search: {
      query: 'carga',
      indexBuildMs: searchMeasures.indexBuildMs,
      queryMs: searchMeasures.queryMs,
      targetMs: 50,
      targetMet: searchMeasures.queryMs !== null && searchMeasures.queryMs < 50,
    },
    renderedNodes: await page.getByRole('treeitem').count(),
    browser: await page.evaluate(() => navigator.userAgent),
    viewport: page.viewportSize(),
  };
  const reportJson = JSON.stringify(report, null, 2);
  await mkdir(resolve(process.cwd(), 'test-results'), { recursive: true });
  await writeFile(resolve(process.cwd(), 'test-results/stress-performance.json'), reportJson);
  await testInfo.attach('stress-performance.json', {
    body: reportJson,
    contentType: 'application/json',
  });

  expect(await page.getByRole('treeitem').count()).toBeGreaterThan(0);
  expect(notes).toHaveLength(TOTAL_NOTES);
  expect(searchMeasures.queryMs).not.toBeNull();
  expect(searchMeasures.queryMs).toBeLessThan(50);
});
