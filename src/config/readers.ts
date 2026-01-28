import * as vscode from 'vscode';
import { SkillReader } from '../types';

/**
 * Built-in default SkillReader configurations
 */
export const DEFAULT_READERS: SkillReader[] = [
  {
    id: 'amp',
    name: 'Amp, Kimi Code CLI',
    shortName: 'AMP',
    globalPath: '~/.config/agents/skills',
    projectPath: '.agents/skills',
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    shortName: 'AG',
    globalPath: '~/.gemini/antigravity/global_skills',
    projectPath: '.agent/skills',
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    shortName: 'CC',
    globalPath: '~/.claude/skills',
    projectPath: '.claude/skills',
  },
  {
    id: 'moltbot',
    name: 'Moltbot',
    shortName: 'MOLT',
    globalPath: '~/.moltbot/skills',
    projectPath: 'skills',
  },
  {
    id: 'cline',
    name: 'Cline',
    shortName: 'CLINE',
    globalPath: '~/.cline/skills',
    projectPath: '.cline/skills',
  },
  {
    id: 'codebuddy',
    name: 'CodeBuddy',
    shortName: 'CB',
    globalPath: '~/.codebuddy/skills',
    projectPath: '.codebuddy/skills',
  },
  {
    id: 'codex',
    name: 'Codex',
    shortName: 'CX',
    globalPath: '~/.codex/skills',
    projectPath: '.codex/skills',
  },
  {
    id: 'command-code',
    name: 'Command Code',
    shortName: 'CMD',
    globalPath: '~/.commandcode/skills',
    projectPath: '.commandcode/skills',
  },
  {
    id: 'continue',
    name: 'Continue',
    shortName: 'CONT',
    globalPath: '~/.continue/skills',
    projectPath: '.continue/skills',
  },
  {
    id: 'crush',
    name: 'Crush',
    shortName: 'CRUSH',
    globalPath: '~/.config/crush/skills',
    projectPath: '.crush/skills',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    shortName: 'CUR',
    globalPath: '~/.cursor/skills',
    projectPath: '.cursor/skills',
  },
  {
    id: 'droid',
    name: 'Droid',
    shortName: 'DROID',
    globalPath: '~/.factory/skills',
    projectPath: '.factory/skills',
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    shortName: 'GM',
    globalPath: '~/.gemini/skills',
    projectPath: '.gemini/skills',
  },
  {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    shortName: 'COPILOT',
    globalPath: '~/.copilot/skills',
    projectPath: '.github/skills',
  },
  {
    id: 'goose',
    name: 'Goose',
    shortName: 'GOOSE',
    globalPath: '~/.config/goose/skills',
    projectPath: '.goose/skills',
  },
  {
    id: 'junie',
    name: 'Junie',
    shortName: 'JUNIE',
    globalPath: '~/.junie/skills',
    projectPath: '.junie/skills',
  },
  {
    id: 'kilo',
    name: 'Kilo Code',
    shortName: 'KILO',
    globalPath: '~/.kilocode/skills',
    projectPath: '.kilocode/skills',
  },
  {
    id: 'kiro-cli',
    name: 'Kiro CLI',
    shortName: 'KIRO',
    globalPath: '~/.kiro/skills',
    projectPath: '.kiro/skills',
  },
  {
    id: 'kode',
    name: 'Kode',
    shortName: 'KODE',
    globalPath: '~/.kode/skills',
    projectPath: '.kode/skills',
  },
  {
    id: 'mcpjam',
    name: 'MCPJam',
    shortName: 'MCP',
    globalPath: '~/.mcpjam/skills',
    projectPath: '.mcpjam/skills',
  },
  {
    id: 'mux',
    name: 'Mux',
    shortName: 'MUX',
    globalPath: '~/.mux/skills',
    projectPath: '.mux/skills',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    shortName: 'OPEN',
    globalPath: '~/.config/opencode/skills',
    projectPath: '.opencode/skills',
  },
  {
    id: 'openhands',
    name: 'OpenHands',
    shortName: 'HANDS',
    globalPath: '~/.openhands/skills',
    projectPath: '.openhands/skills',
  },
  {
    id: 'pi',
    name: 'Pi',
    shortName: 'PI',
    globalPath: '~/.pi/agent/skills',
    projectPath: '.pi/skills',
  },
  {
    id: 'qoder',
    name: 'Qoder',
    shortName: 'QODER',
    globalPath: '~/.qoder/skills',
    projectPath: '.qoder/skills',
  },
  {
    id: 'qwen-code',
    name: 'Qwen Code',
    shortName: 'QWEN',
    globalPath: '~/.qwen/skills',
    projectPath: '.qwen/skills',
  },
  {
    id: 'roo',
    name: 'Roo Code',
    shortName: 'ROO',
    globalPath: '~/.roo/skills',
    projectPath: '.roo/skills',
  },
  {
    id: 'trae',
    name: 'Trae',
    shortName: 'TRAE',
    globalPath: '~/.trae/skills',
    projectPath: '.trae/skills',
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    shortName: 'WIND',
    globalPath: '~/.codeium/windsurf/skills',
    projectPath: '.windsurf/skills',
  },
  {
    id: 'zencoder',
    name: 'Zencoder',
    shortName: 'ZEN',
    globalPath: '~/.zencoder/skills',
    projectPath: '.zencoder/skills',
  },
  {
    id: 'neovate',
    name: 'Neovate',
    shortName: 'NEO',
    globalPath: '~/.neovate/skills',
    projectPath: '.neovate/skills',
  },
  {
    id: 'pochi',
    name: 'Pochi',
    shortName: 'POCHI',
    globalPath: '~/.pochi/skills',
    projectPath: '.pochi/skills',
  },
  {
    id: 'skills-cli',
    name: 'Agents (Universal)',
    shortName: 'UN',
    globalPath: '~/.agents/skills',
    projectPath: '.agents/skills',
  },
];

/**
 * Get merged readers from default + user configuration
 */
export function getReaders(): SkillReader[] {
  const config = vscode.workspace.getConfiguration('skillKnife');
  const userReaders = config.get<SkillReader[]>('readers') || [];

  // Merge: user config overrides defaults by id
  const readerMap = new Map<string, SkillReader>();

  for (const reader of DEFAULT_READERS) {
    readerMap.set(reader.id, reader);
  }

  for (const reader of userReaders) {
    readerMap.set(reader.id, { ...readerMap.get(reader.id), ...reader });
  }

  return Array.from(readerMap.values());
}
