import * as path from 'path';
import * as fs from 'fs';

import { Skill } from '../types';
import { MarketSkill, fetchMarketSkills, getAllMarkets } from './marketService';
import { scanSkillsAsync } from './skillScanner';
import { runSkillsCliInteractive, getInstallArgs, getAgentArgs } from './cliService';
import { PersistenceService } from './persistenceService';

export interface SkillUpdateInfo {
  skill: Skill;
  marketSkill: MarketSkill;
  hasUpdate: boolean;
  installedCommit?: string;
  latestCommit?: string;
}

/**
 * Get the commit hash from installed skill metadata
 */
function getInstalledCommit(skill: Skill): string | undefined {
  if (skill.installations.length === 0) {
    return undefined;
  }

  // With CLI, path points to the skill directory.
  // We assume .openskills.json might still exist there if the skill follows the standard.
  const metaPath = path.join(skill.installations[0].path, '.openskills.json');
  if (!fs.existsSync(metaPath)) {
    return undefined;
  }

  try {
    const content = fs.readFileSync(metaPath, 'utf-8');
    const meta = JSON.parse(content);
    return meta.commitHash;
  } catch {
    return undefined;
  }
}

/**
 * Check if a skill has updates available
 */
export async function checkForUpdates(): Promise<SkillUpdateInfo[]> {
  const updates: SkillUpdateInfo[] = [];
  const installedSkills = await scanSkillsAsync();
  const markets = getAllMarkets();

  // Fetch all market skills
  const allMarketSkills: MarketSkill[] = [];
  for (const market of markets) {
    try {
      const skills = await fetchMarketSkills(market);
      allMarketSkills.push(...skills);
    } catch {
      // Skip failed markets
    }
  }

  // Compare installed skills with market versions
  for (const skill of installedSkills) {
    // Find matching market skill
    const marketSkill = allMarketSkills.find((ms) => ms.name === skill.name);
    if (!marketSkill) {
      continue; // Not from a market
    }

    // Get installed commit from .openskills.json
    const installedCommit = getInstalledCommit(skill);
    const latestCommit = marketSkill.commitHash;

    const hasUpdate = !!(installedCommit && latestCommit && installedCommit !== latestCommit);

    updates.push({
      skill,
      marketSkill,
      hasUpdate,
      installedCommit,
      latestCommit,
    });
  }

  return updates;
}

/**
 * Check if a specific skill has an update available
 */
export function hasUpdateAvailable(
  skillName: string,
  installedSkills: Skill[],
  marketSkills: MarketSkill[]
): boolean {
  const skill = installedSkills.find((s) => s.name === skillName);
  if (!skill) {
    return false;
  }

  const marketSkill = marketSkills.find((ms) => ms.name === skillName);
  if (!marketSkill) {
    return false;
  }

  const installedCommit = getInstalledCommit(skill);
  const latestCommit = marketSkill.commitHash;

  return !!(installedCommit && latestCommit && installedCommit !== latestCommit);
}

/**
 * Update all skills that have updates available
 */
export async function updateAllSkills(
  progressCallback?: (message: string) => void
): Promise<string[]> {
  const updates = await checkForUpdates();
  const updatable = updates.filter((u) => u.hasUpdate);
  const updatedNames: string[] = [];

  for (const info of updatable) {
    if (progressCallback) {
      progressCallback(`Updating ${info.skill.name}...`);
    }

    try {
      // Use CLI to update (essentially 'add' again)
      const args = ['add', ...getInstallArgs(info.marketSkill), ...getAgentArgs(PersistenceService.getPreferredAgents()), '-y'];
      await runSkillsCliInteractive(args);
      updatedNames.push(info.skill.name);
    } catch (error) {
      console.error(`Failed to update ${info.skill.name}:`, error);
      if (progressCallback) {
        progressCallback(`Failed to update ${info.skill.name}: ${error}`);
      }
    }
  }

  return updatedNames;
}
