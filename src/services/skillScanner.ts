import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Skill, SkillInstallation, SkillMetadata, SkillReader, SkillScope } from '../types';
import { getReaders } from '../config/readers';

/**
 * Expands ~ to home directory
 */
function expandPath(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

/**
 * Parse SKILL.md frontmatter to extract description
 */
function parseSkillDescription(skillPath: string): string | undefined {
  const skillMdPath = path.join(skillPath, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) {
    return undefined;
  }

  try {
    const content = fs.readFileSync(skillMdPath, 'utf-8');
    // Match YAML frontmatter
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (match) {
      const frontmatter = match[1];
      const descMatch = frontmatter.match(/description:\s*["']?(.+?)["']?\s*$/m);
      if (descMatch) {
        return descMatch[1].trim();
      }
    }
  } catch {
    // Ignore read errors
  }
  return undefined;
}

/**
 * Parse .openskills.json metadata
 */
function parseSkillMetadata(skillPath: string): SkillMetadata | undefined {
  const metaPath = path.join(skillPath, '.openskills.json');
  if (!fs.existsSync(metaPath)) {
    return undefined;
  }

  try {
    const content = fs.readFileSync(metaPath, 'utf-8');
    return JSON.parse(content) as SkillMetadata;
  } catch {
    // Ignore parse errors
  }
  return undefined;
}

/**
 * Scan a directory for skills
 */
function scanDirectory(
  dirPath: string,
  scope: SkillScope,
  readerId: string
): SkillInstallation[] {
  const installations: SkillInstallation[] = [];
  const expanded = expandPath(dirPath);

  if (!fs.existsSync(expanded)) {
    return installations;
  }

  try {
    const entries = fs.readdirSync(expanded, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const skillPath = path.join(expanded, entry.name);
        // Check if it's a valid skill (has SKILL.md)
        if (fs.existsSync(path.join(skillPath, 'SKILL.md'))) {
          installations.push({
            scope,
            readerId,
            path: skillPath,
          });
        }
      }
    }
  } catch {
    // Ignore access errors
  }

  return installations;
}

/**
 * Scan all configured locations for installed skills
 */
export function scanSkills(): Skill[] {
  const readers = getReaders();
  const workspaceFolders = vscode.workspace.workspaceFolders;

  // Map: skill name -> installations
  const skillMap = new Map<string, SkillInstallation[]>();

  for (const reader of readers) {
    // Scan global path
    const globalInstalls = scanDirectory(reader.globalPath, 'global', reader.id);
    for (const install of globalInstalls) {
      const name = path.basename(install.path);
      const existing = skillMap.get(name) || [];
      existing.push(install);
      skillMap.set(name, existing);
    }

    // Scan project paths
    if (workspaceFolders) {
      for (const folder of workspaceFolders) {
        const projectPath = path.join(folder.uri.fsPath, reader.projectPath);
        const projectInstalls = scanDirectory(projectPath, 'project', reader.id);
        for (const install of projectInstalls) {
          const name = path.basename(install.path);
          const existing = skillMap.get(name) || [];
          existing.push(install);
          skillMap.set(name, existing);
        }
      }
    }
  }

  // Build Skill objects
  const skills: Skill[] = [];
  for (const [name, installations] of skillMap) {
    // Get description and metadata from first installation
    const firstPath = installations[0].path;
    skills.push({
      name,
      description: parseSkillDescription(firstPath),
      installations,
      metadata: parseSkillMetadata(firstPath),
    });
  }

  // Sort by name
  skills.sort((a, b) => a.name.localeCompare(b.name));

  return skills;
}

/**
 * Get SkillReader by id
 */
export function getReaderById(id: string): SkillReader | undefined {
  return getReaders().find(r => r.id === id);
}
