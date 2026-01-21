import * as vscode from 'vscode';
import { SkillReader } from '../types';

/**
 * Built-in default SkillReader configurations
 */
export const DEFAULT_READERS: SkillReader[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    shortName: 'CC',
    globalPath: '~/.claude/skills',
    projectPath: '.claude/skills',
  },
  {
    id: 'codex',
    name: 'Codex',
    shortName: 'CX',
    globalPath: '~/.codex/skills',
    projectPath: '.codex/skills',
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    shortName: 'GM',
    globalPath: '~/.gemini/skills',
    projectPath: '.gemini/skills',
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    shortName: 'AG',
    globalPath: '~/.agent/skills',
    projectPath: '.agent/skills',
  },
];

/**
 * Get merged readers from default + user configuration
 */
export function getReaders(): SkillReader[] {
  const config = vscode.workspace.getConfiguration('skillManager');
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
