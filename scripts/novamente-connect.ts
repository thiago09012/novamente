#!/usr/bin/env node
import { createRequire } from 'node:module';
import { accessSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { createInterface, type Interface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import {
  getMcpClient,
  MCP_CLIENTS,
  mergeConfig,
  type HostPlatform,
  type McpClientId,
  type McpScope,
} from '../src/mcp/clients';

interface Args {
  ide?: string;
  scope?: string;
  vault: string;
  base?: string;
  name: string;
  yes: boolean;
  force: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string | boolean>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Argumento inesperado: ${token}`);
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      flags.set(key, next);
      index += 1;
    } else flags.set(key, true);
  }
  const stringFlag = (key: string) => {
    const value = flags.get(key);
    return typeof value === 'string' ? value : undefined;
  };
  return {
    ide: stringFlag('ide'),
    scope: stringFlag('scope'),
    vault: stringFlag('vault') ?? 'novamente-vault',
    base: stringFlag('base'),
    name: stringFlag('name') ?? 'novamente',
    yes: flags.get('yes') === true,
    force: flags.get('force') === true,
    dryRun: flags.get('dry-run') === true,
  };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/gu, `'\\''`)}'`;
}

function expandConfigPath(path: string, home: string): string {
  if (path.startsWith('~/')) return join(home, path.slice(2));
  if (path.startsWith('%USERPROFILE%\\')) return join(home, path.slice('%USERPROFILE%\\'.length));
  if (path.startsWith('%APPDATA%\\')) {
    const appData = process.env.APPDATA;
    return appData ? join(appData, path.slice('%APPDATA%\\'.length)) : path;
  }
  return path;
}

async function chooseFromList(
  label: string,
  options: readonly { label: string; value: string }[],
  defaultValue?: string,
): Promise<string> {
  console.log(label);
  options.forEach((option, index) => console.log(`  ${index + 1}) ${option.label}`));
  const defaultIndex = options.findIndex((option) => option.value === defaultValue);
  const answer = (
    await prompt(`Número${defaultIndex >= 0 ? ` [${defaultIndex + 1}]` : ''}: `)
  ).trim();
  const selected = answer ? Number(answer) - 1 : defaultIndex;
  if (!Number.isInteger(selected) || selected < 0 || selected >= options.length) {
    throw new Error('Seleção inválida.');
  }
  return options[selected].value;
}

let readline: Interface | null = null;
function prompt(question: string): Promise<string> {
  if (!readline) readline = createInterface({ input: stdin, output: stdout });
  return readline.question(question);
}

function closeReadline(): void {
  readline?.close();
}

async function confirm(question: string, yes: boolean): Promise<boolean> {
  if (yes) return true;
  return (await prompt(`${question} [s/N] `)).trim().toLowerCase() === 's';
}

function requirePreflight(repoDir: string, vaultDir: string): void {
  if (Number(process.versions.node.split('.')[0]) < 20) {
    throw new Error(`Node.js 20 ou superior é obrigatório. Atual: ${process.version}`);
  }
  const require = createRequire(import.meta.url);
  try {
    require.resolve('@modelcontextprotocol/sdk/server/mcp.js');
  } catch {
    throw new Error(
      'SDK MCP ausente. Execute npm install --legacy-peer-deps @modelcontextprotocol/sdk.',
    );
  }
  const serverFile = join(repoDir, 'scripts', 'mcp-server.ts');
  const tsxFile = join(repoDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  if (!existsSync(serverFile) || !existsSync(tsxFile)) {
    throw new Error(
      'Servidor MCP/tsx não encontrado. Execute o assistente na pasta do projeto instalado.',
    );
  }
  if (!existsSync(vaultDir)) throw new Error(`Vault não existe: ${vaultDir}`);
  accessSync(vaultDir, constants.R_OK | constants.X_OK);
}

function printWindowsGuide(clientId: McpClientId, scope: McpScope): void {
  const client = getMcpClient(clientId);
  const path = client.path(scope, 'win32');
  console.log('A instalação automática de configurações no Windows ainda não está habilitada.');
  console.log(`Arquivo equivalente: ${path ?? 'Claude Code usa o comando de terminal abaixo.'}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const repoDir = resolve(process.cwd());
  const host = process.platform as HostPlatform;
  const vaultDir = resolve(args.vault);
  const basePath = resolve(args.base ?? join(vaultDir, '.novamente', 'base.json'));
  requirePreflight(repoDir, vaultDir);

  let ide = args.ide;
  if (!ide) {
    if (!stdin.isTTY) throw new Error('Informe --ide ou execute em terminal interativo.');
    ide = await chooseFromList(
      'Escolha a IDE:',
      MCP_CLIENTS.map((client) => ({
        label: client.label,
        value: client.id,
      })),
    );
  }
  const client = getMcpClient(ide);
  let scope = args.scope as McpScope | undefined;
  if (!scope) {
    if (client.scopes.length === 1) scope = client.scopes[0];
    else if (stdin.isTTY) {
      scope = (await chooseFromList(
        'Onde instalar?',
        client.scopes.map((value) => ({
          label:
            value === 'global'
              ? 'Global (seus projetos)'
              : value === 'project'
                ? 'Este projeto'
                : 'Local (só você neste projeto)',
          value,
        })),
        'global',
      )) as McpScope;
    } else throw new Error('Informe --scope global, project ou local.');
  }
  if (!client.scopes.includes(scope)) {
    throw new Error(`Escopo ${scope} não é suportado por ${client.label}.`);
  }
  if (host === 'win32') {
    printWindowsGuide(client.id, scope);
    return;
  }

  const nodePath = process.execPath;
  const tsxPath = join(repoDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const serverPath = join(repoDir, 'scripts', 'mcp-server.ts');
  const context = { nodePath, tsxPath, serverPath, repoDir, vaultDir, basePath, name: args.name };

  if (client.id === 'claude-code') {
    const claudeScope = scope === 'global' ? 'user' : scope;
    const command = [
      'claude',
      'mcp',
      'add',
      '-t',
      'stdio',
      '-s',
      claudeScope,
      '--env',
      `NOVAMENTE_VAULT_DIR=${vaultDir}`,
      '--env',
      `NOVAMENTE_BASE_BACKUP=${basePath}`,
      args.name,
      '--',
      nodePath,
      tsxPath,
      serverPath,
    ]
      .map(shellQuote)
      .join(' ');
    console.log('Execute este comando no terminal para registrar o servidor:');
    console.log(command);
    console.log(client.afterInstall);
    return;
  }

  const pathTemplate = client.path(scope, host);
  if (!pathTemplate) throw new Error('Este cliente não possui arquivo de configuração.');
  const configPath = isAbsolute(pathTemplate)
    ? pathTemplate
    : pathTemplate.startsWith('~/')
      ? expandConfigPath(pathTemplate, homedir())
      : join(repoDir, pathTemplate);
  const configText = existsSync(configPath) ? readFileSync(configPath, 'utf8') : '{}';
  let parsed: unknown;
  try {
    parsed = JSON.parse(configText);
  } catch {
    throw new Error(`Configuração JSON inválida: ${configPath}`);
  }
  const key = client.key;
  if (!key) throw new Error('Schema de configuração indisponível.');
  const root =
    typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  const section = root[key];
  const existingEntry =
    typeof section === 'object' && section !== null
      ? (section as Record<string, unknown>)[args.name]
      : undefined;
  if (existingEntry !== undefined && !args.force) {
    const replace = await confirm(`Já existe uma entrada "${args.name}". Substituir?`, args.yes);
    if (!replace)
      throw new Error(
        'Instalação cancelada; a configuração existente foi preservada. Use --force para substituir.',
      );
  }

  const isProjectConfig = scope === 'project';
  if (
    isProjectConfig &&
    !(await confirm('Esta configuração fica no projeto e pode entrar no Git. Continuar?', args.yes))
  ) {
    throw new Error('Instalação cancelada.');
  }

  const entry = client.buildEntry(context);
  const merged = mergeConfig(parsed, key, entry);
  const output = JSON.stringify(merged, null, 2);
  if (args.dryRun) {
    console.log(`Prévia — ${configPath}`);
    console.log(output);
    console.log(client.afterInstall);
    return;
  }

  if (existsSync(configPath)) {
    const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
    const backupPath = `${configPath}.bak-${stamp}`;
    writeFileSync(backupPath, configText, 'utf8');
    console.log(`Backup criado: ${backupPath}`);
  }
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${output}\n`, 'utf8');
  console.log(`Servidor MCP instalado em ${configPath}.`);
  console.log(client.afterInstall);
}

try {
  await main();
} catch (error) {
  console.error(`Erro: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  closeReadline();
}
