import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { Market } from '../types';
import { getMarkets } from '../config/markets';

/**
 * Represents a skill available in a market
 */
export interface MarketSkill {
  name: string;
  description?: string;
  market: Market;
  repoPath: string; // e.g., "anthropics/skills"
  subpath: string;  // e.g., "skills/brainstorming"
}

/**
 * Execute git command
 */
async function execGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = cp.spawn('git', args, { cwd, shell: true });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `git exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Find all skill directories in a repo
 */
function findSkillDirectories(repoDir: string): string[] {
  const skills: string[] = [];

  // Look for common skill directory patterns
  const searchDirs = [
    path.join(repoDir, 'skills'),
    repoDir,
  ];

  for (const searchDir of searchDirs) {
    if (!fs.existsSync(searchDir)) {
      continue;
    }

    try {
      const entries = fs.readdirSync(searchDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const skillPath = path.join(searchDir, entry.name);
          if (fs.existsSync(path.join(skillPath, 'SKILL.md'))) {
            skills.push(skillPath);
          }
        }
      }
    } catch {
      // Ignore access errors
    }
  }

  return skills;
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
 * Get cache directory for market repos
 */
export function getCacheDir(): string {
  return path.join(os.homedir(), '.skill-manager', 'cache');
}

/**
 * Fetch skills list from a git repository by cloning/updating locally
 */
export async function fetchMarketSkills(market: Market): Promise<MarketSkill[]> {
  const skills: MarketSkill[] = [];

  try {
    // Clone or update the repo to a temp location
    const cacheDir = getCacheDir();
    const repoName = market.git.replace(/[\/\\:]/g, '_');
    const repoDir = path.join(cacheDir, repoName);

    // Ensure cache directory exists
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    // Clone or pull the repository
    if (fs.existsSync(repoDir)) {
      // Pull latest changes
      await execGit(['pull'], repoDir);
    } else {
      // Clone the repository
      const gitUrl = market.git.includes('://')
        ? market.git
        : `https://github.com/${market.git}.git`;
      await execGit(['clone', '--depth', '1', gitUrl, repoDir], cacheDir);
    }

    // Scan for skills in the repo
    const skillDirs = findSkillDirectories(repoDir);
    for (const skillDir of skillDirs) {
      const skillName = path.basename(skillDir);
      const description = parseSkillDescription(skillDir);
      const subpath = path.relative(repoDir, skillDir);

      skills.push({
        name: skillName,
        description,
        market,
        repoPath: market.git,
        subpath,
      });
    }
  } catch (error) {
    console.error(`Failed to fetch skills from ${market.name}:`, error);
    throw error;
  }

  return skills;
}

/**
 * Get all configured markets
 */
export function getAllMarkets(): Market[] {
  return getMarkets();
}
