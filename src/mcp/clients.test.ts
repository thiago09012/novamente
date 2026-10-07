import { describe, expect, it } from 'vitest';

import { MCP_CLIENTS, mergeConfig } from './clients';

const entry = { name: 'novamente', command: '/node', args: ['/server.ts'] };

describe('configuração MCP por cliente', () => {
  it.each(MCP_CLIENTS.filter((client) => client.key !== null))(
    'mescla sem apagar outras configurações: $label',
    (client) => {
      const key = client.key;
      if (!key) throw new Error('Cliente sem schema JSON.');
      const existing = {
        keep: true,
        [key]: { another: { command: 'other' } },
      };
      expect(mergeConfig(existing, key, entry)).toEqual({
        keep: true,
        [key]: {
          another: { command: 'other' },
          novamente: { command: '/node', args: ['/server.ts'] },
        },
      });
    },
  );

  it('cobre os três nomes de schema divergentes', () => {
    expect(mergeConfig({}, 'mcpServers', entry)).toHaveProperty('mcpServers.novamente');
    expect(mergeConfig({}, 'servers', entry)).toHaveProperty('servers.novamente');
    expect(mergeConfig({}, 'mcp', entry)).toHaveProperty('mcp.novamente');
  });
});
