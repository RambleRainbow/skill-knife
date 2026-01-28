import * as fs from 'fs';
import { Skill, SkillInstallation, SkillReader, SkillScope } from '../types';
import { getReaders } from '../config/readers';
import { MarketSkill } from './marketService';

export interface InstallOptions {
  skill: MarketSkill;
  scope: SkillScope;
  readers: SkillReader[];
}

/**
 * Install a skill to specified readers
 */
import { runSkillsCliInteractive, getInstallArgs } from './cliService';

/**
 * Install a skill to specified readers using skills CLI
 */
export async function installSkill(options: InstallOptions): Promise<void> {
  const { skill, scope, readers } = options;
  const args = ['add', ...getInstallArgs(skill), '--all', '-y'];

  if (scope === 'global') {
    args.push('--global');
  }

  // Not used right now but kept for compatibility
  if (readers && readers.length > 0) {
    args.push('--agent', readers.map(r => r.name).join(','));
  }

  try {
    // We launch the interactive terminal
    runSkillsCliInteractive(args);
    return Promise.resolve();
  } catch (error) {
    return Promise.reject(error);
  }
}

/**
 * Get all available readers
 */
export function getAvailableReaders(): SkillReader[] {
  return getReaders();
}

/**
 * Delete a skill installation
 */
export function deleteSkillInstallation(installation: SkillInstallation): void {
  if (fs.existsSync(installation.path)) {
    fs.rmSync(installation.path, { recursive: true, force: true });
  }
}

/**
 * Delete all installations of a skill
 */
export function deleteSkill(skill: Skill): void {
  for (const installation of skill.installations) {
    deleteSkillInstallation(installation);
  }
}
