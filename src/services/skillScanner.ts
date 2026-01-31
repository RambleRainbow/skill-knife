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
 * Parse .skill-lock.json metadata
 */
let lockFileCache: any = null;
let lastLockRead = 0;

function getSkillLockMetadata(skillName: string): SkillMetadata | undefined {
  const lockPath = path.join(os.homedir(), '.agents', '.skill-lock.json');

  // Simple cache (1 second) to avoid reading file for every skill in loop
  if (!lockFileCache || Date.now() - lastLockRead > 1000) {
    if (fs.existsSync(lockPath)) {
      try {
        const content = fs.readFileSync(lockPath, 'utf-8');
        lockFileCache = JSON.parse(content);
        lastLockRead = Date.now();
      } catch {
        lockFileCache = { skills: {} };
      }
    } else {
      lockFileCache = { skills: {} };
    }
  }

  const skillEntry = lockFileCache.skills?.[skillName];
  if (skillEntry) {
    return {
      source: skillEntry.source,
      sourceType: skillEntry.sourceType,
      repoUrl: skillEntry.sourceUrl, // Map sourceUrl to repoUrl (or keep both if type allows)
      sourceUrl: skillEntry.sourceUrl,
      subpath: skillEntry.skillPath ? path.dirname(skillEntry.skillPath) : undefined, // skillPath is usually "skills/name/SKILL.md"
      skillPath: skillEntry.skillPath,
      skillFolderHash: skillEntry.skillFolderHash,
      installedAt: skillEntry.installedAt,
      updatedAt: skillEntry.updatedAt
    };
  }

  return undefined;
}



/**
 * Scan all configured locations for installed skills
 */
import { runSkillsCliCapture } from './cliService';

/**
 * Scan all configured locations for installed skills using CLI
 */
export async function scanSkillsAsync(): Promise<Skill[]> {
  // Map: skill name -> installations
  const skillMap = new Map<string, SkillInstallation[]>();

  try {
    // 1. Fetch Global Skills
    try {
      const globalOutput = await runSkillsCliCapture(['list', '-g']);
      const globalSkills = parseSkillsListOutput(globalOutput, 'global');
      for (const skill of globalSkills) {
        skillMap.set(skill.name, skill.installations);
      }
    } catch (e) {
      console.error('Failed to scan global skills:', e);
    }

    // 2. Fetch Project Skills
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      try {
        const projectOutput = await runSkillsCliCapture(['list']);
        const projectSkills = parseSkillsListOutput(projectOutput, 'project');

        for (const skill of projectSkills) {
          const existing = skillMap.get(skill.name);
          if (existing) {
            // Merge installations
            existing.push(...skill.installations);
          } else {
            skillMap.set(skill.name, skill.installations);
          }
        }
      } catch (e) {
        console.error('Failed to scan project skills:', e);
      }
    }

  } catch (err) {
    console.error('Error scanning skills:', err);
    return [];
  }

  // Build Skill objects
  const skills: Skill[] = [];
  for (const [name, installations] of skillMap) {
    // Get description and metadata from first installation
    // For CLI list, we might not have path readily available in all output formats, 
    // but the mocked output showed: "agent-browser ~/.agents/skills/agent-browser"

    // We try to find a valid path to read description if possible
    let description: string | undefined;
    const pathInstall = installations.find(i => i.path);
    if (pathInstall && pathInstall.path) {
      description = parseSkillDescription(pathInstall.path);
    }

    skills.push({
      name,
      description,
      installations,
      metadata: getSkillLockMetadata(name),
    });
  }

  // Sort by name
  skills.sort((a, b) => a.name.localeCompare(b.name));

  return skills;
}

/**
 * Parse output from `skills list`
 */
function parseSkillsListOutput(output: string, scope: SkillScope): Skill[] {
  const lines = output.split('\n');
  const skills: Skill[] = [];

  // Output format example:
  // agent-browser ~/.agents/skills/agent-browser
  //   Agents: Antigravity, Claude Code, Codex...

  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.startsWith('Global Skills') || line.startsWith('Project Skills')) continue;
    if (line.trim().startsWith('Agents:')) continue;
    if (line.includes('No project skills found') || line.includes('No global skills found')) continue;

    // Naive parsing: Assume first word is name, rest is path if present
    // This line: "agent-browser ~/.agents/skills/agent-browser"
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 1) {
      const name = parts[0];
      const skillPath = parts.slice(1).join(' '); // Remainder is path

      // Simple validation: name shouldn't contain paths usually
      if (name.includes('/') || name.includes('\\')) continue;

      const expandedPath = expandPath(skillPath);

      skills.push({
        name,
        installations: [{
          scope,
          readerId: 'cli', // Generic ID for CLI source
          path: expandedPath
        }]
      });
    }
  }
  return skills;
}

/**
 * Deprecated: Use scanSkillsAsync
 */
export function scanSkills(): Skill[] {
  // Return empty or throw, but for compatibility might implementing blocking wait is hard.
  // Ideally we migrate all callers.
  return [];
}

/**
 * Get SkillReader by id
 */
export function getReaderById(id: string): SkillReader | undefined {
  return getReaders().find(r => r.id === id);
}
