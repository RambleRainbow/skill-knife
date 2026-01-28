/**
 * Describes how a specific agent software reads skills
 */
export interface SkillReader {
  /** Unique identifier, e.g., "claude-code", "codex" */
  id: string;
  /** Display name, e.g., "Claude Code" */
  name: string;
  /** Short label for UI tags, e.g., "CC", "CX" */
  shortName: string;
  /** Version constraint, e.g., ">=1.0" */
  version?: string;
  /** Global skill path, e.g., "~/.claude/skills" */
  globalPath: string;
  /** Project-relative skill path, e.g., ".claude/skills" */
  projectPath: string;
}

/**
 * Scope where a skill is installed
 */
export type SkillScope = 'global' | 'project';

/**
 * A single installation location of a skill
 */
export interface SkillInstallation {
  /** Which scope */
  scope: SkillScope;
  /** Which reader */
  readerId: string;
  /** Absolute path to skill directory */
  path: string;
}

/**
 * Metadata from .skill-lock.json or legacy .openskills.json
 */
export interface SkillMetadata {
  source?: string; // owner/repo
  sourceType?: string; // e.g. "github"
  repoUrl?: string; // e.g. "https://github.com/..."
  sourceUrl?: string; // e.g. "https://github.com/..." (from lockfile)
  subpath?: string;
  skillPath?: string; // e.g. "skills/foo/SKILL.md" (from lockfile)
  skillFolderHash?: string; // (from lockfile)
  installedAt?: string;
  updatedAt?: string; // (from lockfile)
}

/**
 * A skill with all its installation locations
 */
export interface Skill {
  /** Skill name (directory name) */
  name: string;
  /** Description from SKILL.md frontmatter */
  description?: string;
  /** All places this skill is installed */
  installations: SkillInstallation[];
  /** Metadata from .openskills.json (from first found installation) */
  metadata?: SkillMetadata;
}

/**
 * Market configuration
 */
export interface Market {
  /** Display name */
  name: string;
  /** Git repository URL */
  git: string;
}

/**
 * Reference to a skill in a profile
 */
export interface InstalledSkillRef {
  name: string;
  source: string; // The "install source" needed for openskills install
}

/**
 * Saved skill profile
 */
export interface SkillProfile {
  name: string;
  created: number;
  skills: InstalledSkillRef[];
}
