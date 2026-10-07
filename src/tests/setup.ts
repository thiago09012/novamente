import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

import '@testing-library/jest-dom/vitest';

// jsdom não implementa canvas e emite "Not implemented" a cada getContext;
// devolvemos null direto (a camada de medição já trata null com estimativa).
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: () => null,
  configurable: true,
  writable: true,
});

afterEach(cleanup);
