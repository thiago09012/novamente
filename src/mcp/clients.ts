export type McpClientId =
  'antigravity' | 'cursor' | 'vscode' | 'claude-desktop' | 'windsurf' | 'opencode' | 'claude-code';
export type McpScope = 'global' | 'project' | 'local';
export type McpConfigKey = 'mcpServers' | 'servers' | 'mcp';
export type HostPlatform = 'linux' | 'darwin' | 'win32';

export interface McpCommandContext {
  nodePath: string;
  tsxPath: string;
  serverPath: string;
  repoDir: string;
  vaultDir: string;
  basePath: string;
  name: string;
}

export interface McpClientDefinition {
  id: McpClientId;
  label: string;
  key: McpConfigKey | null;
  scopes: readonly McpScope[];
  path(scope: McpScope, platform: HostPlatform): string | null;
  buildEntry(context: McpCommandContext): unknown;
  afterInstall: string;
}

function standardEntry(context: McpCommandContext) {
  return {
    name: context.name,
    command: context.nodePath,
    args: [context.tsxPath, context.serverPath],
    cwd: context.repoDir,
    env: { MENTE_VAULT_DIR: context.vaultDir, MENTE_BASE_BACKUP: context.basePath },
  };
}

const homePath = (platform: HostPlatform, ...parts: string[]) =>
  platform === 'win32' ? `%USERPROFILE%\\${parts.join('\\')}` : `~/${parts.join('/')}`;

export const MCP_CLIENTS: readonly McpClientDefinition[] = [
  {
    id: 'antigravity',
    label: 'Antigravity',
    key: 'mcpServers',
    scopes: ['global', 'project'],
    path: (scope, platform) =>
      scope === 'project'
        ? '.agents/mcp_config.json'
        : homePath(platform, '.gemini', 'config', 'mcp_config.json'),
    buildEntry: standardEntry,
    afterInstall: 'Recarregue os MCP Servers nas configurações do Antigravity.',
  },
  {
    id: 'cursor',
    label: 'Cursor',
    key: 'mcpServers',
    scopes: ['global', 'project'],
    path: (scope, platform) =>
      scope === 'project' ? '.cursor/mcp.json' : homePath(platform, '.cursor', 'mcp.json'),
    buildEntry: standardEntry,
    afterInstall: 'Reinicie ou atualize os servidores MCP nas configurações do Cursor.',
  },
  {
    id: 'vscode',
    label: 'VS Code',
    key: 'servers',
    scopes: ['project'],
    path: () => '.vscode/mcp.json',
    buildEntry: (context) => ({ type: 'stdio', ...standardEntry(context) }),
    afterInstall: 'Recarregue a janela do VS Code e aceite o servidor MCP do workspace.',
  },
  {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    key: 'mcpServers',
    scopes: ['global'],
    path: (_scope, platform) =>
      platform === 'darwin'
        ? '~/Library/Application Support/Claude/claude_desktop_config.json'
        : platform === 'win32'
          ? '%APPDATA%\\Claude\\claude_desktop_config.json'
          : homePath(platform, '.config', 'Claude', 'claude_desktop_config.json'),
    buildEntry: standardEntry,
    afterInstall: 'Feche e reabra o Claude Desktop.',
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    key: 'mcpServers',
    scopes: ['global'],
    path: (_scope, platform) => homePath(platform, '.codeium', 'windsurf', 'mcp_config.json'),
    buildEntry: standardEntry,
    afterInstall: 'Reinicie o Windsurf ou recarregue a configuração de MCP.',
  },
  {
    id: 'opencode',
    label: 'opencode',
    key: 'mcp',
    scopes: ['global', 'project'],
    path: (scope, platform) =>
      scope === 'project'
        ? 'opencode.json'
        : homePath(platform, '.config', 'opencode', 'opencode.json'),
    buildEntry: (context) => ({
      name: context.name,
      type: 'local',
      command: [context.nodePath, context.tsxPath, context.serverPath],
      environment: { MENTE_VAULT_DIR: context.vaultDir, MENTE_BASE_BACKUP: context.basePath },
      enabled: true,
    }),
    afterInstall: 'Reabra o opencode para carregar a configuração MCP.',
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    key: null,
    scopes: ['global', 'project', 'local'],
    path: () => null,
    buildEntry: standardEntry,
    afterInstall: 'Reinicie a sessão do Claude Code; use `claude mcp list` para conferir.',
  },
];

export function getMcpClient(id: string): McpClientDefinition {
  const client = MCP_CLIENTS.find((item) => item.id === id);
  if (!client) throw new Error(`IDE não suportada: ${id}`);
  return client;
}

/** Mescla somente a entrada nomeada e mantém outras propriedades do arquivo intactas. */
export function mergeConfig(existing: unknown, key: McpConfigKey, entry: unknown): unknown {
  const root =
    typeof existing === 'object' && existing !== null && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  const currentSection = root[key];
  const section =
    typeof currentSection === 'object' && currentSection !== null && !Array.isArray(currentSection)
      ? (currentSection as Record<string, unknown>)
      : {};
  const record = entry as Record<string, unknown>;
  const name = typeof record.name === 'string' ? record.name : undefined;
  if (!name) throw new Error('A entrada MCP precisa identificar o nome do servidor.');
  const serverConfig = { ...record };
  delete serverConfig.name;
  return { ...root, [key]: { ...section, [name]: serverConfig } };
}
