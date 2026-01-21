import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { SkillReader, SkillScope } from '../types';
import { getReaders } from '../config/readers';
import { MarketSkill, getCacheDir } from './marketService';

export interface InstallOptions {
  skill: MarketSkill;
  scope: SkillScope;
  readers: SkillReader[];
}

/**
 * Expand ~ to home directory
 */
function expandPath(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

/**
 * Copy directory recursively
 */
function copyDir(src: string, dest: string): void {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Install a skill to specified readers
 */
export async function installSkill(options: InstallOptions): Promise<void> {
  const { skill, scope, readers } = options;

  // Get the cached skill directory
  const cacheDir = getCacheDir();
  const repoName = skill.repoPath.replace(/[\/\\:]/g, '_');
  const repoDir = path.join(cacheDir, repoName);
  const skillSourceDir = path.join(repoDir, skill.subpath);

  if (!fs.existsSync(skillSourceDir)) {
    throw new Error(`Skill source not found: ${skillSourceDir}`);
  }

  // Get workspace folder for project scope
  let projectRoot: string | undefined;
  if (scope === 'project') {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error('No workspace folder open for project installation');
    }
    projectRoot = workspaceFolders[0].uri.fsPath;
  }

  // Install to each selected reader
  for (const reader of readers) {
    let targetDir: string;

    if (scope === 'global') {
      targetDir = path.join(expandPath(reader.globalPath), skill.name);
    } else {
      if (!projectRoot) {
        throw new Error('Project root not available');
      }
      targetDir = path.join(projectRoot, reader.projectPath, skill.name);
    }

    // Copy skill files
    copyDir(skillSourceDir, targetDir);

    // Write .openskills.json metadata
    const metadata = {
      source: `https://github.com/${skill.repoPath}`,
      sourceType: 'git',
      repoUrl: `https://github.com/${skill.repoPath}`,
      subpath: skill.subpath,
      installedAt: new Date().toISOString(),
    };

    fs.writeFileSync(
      path.join(targetDir, '.openskills.json'),
      JSON.stringify(metadata, null, 2)
    );
  }
}

/**
 * Get all available readers
 */
export function getAvailableReaders(): SkillReader[] {
  return getReaders();
}
