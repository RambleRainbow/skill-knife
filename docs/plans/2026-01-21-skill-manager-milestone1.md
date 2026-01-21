# SkillManager Milestone 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a VSCode extension that scans and displays locally installed AI agent skills in a sidebar tree view with webview detail pages.

**Architecture:** VSCode extension with TreeDataProvider for sidebar, WebviewPanel for detail views. SkillScanner service reads skill directories based on configurable SkillReader definitions. Skills are the first-class citizen in UI.

**Tech Stack:** TypeScript, VSCode Extension API, Node.js fs/path, Markdown rendering (marked)

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/extension.ts`
- Create: `.vscodeignore`
- Create: `README.md`

**Step 1: Generate VSCode extension project**

Run:
```bash
cd /Users/hongling/Dev/skillManage
npx --package yo --package generator-code -- yo code --extensionType ts --extensionName skill-manager --extensionDisplayName "SkillManager" --extensionDescription "Manage AI agent skills" --gitInit false --pkgManager npm --webpack false
```

Select options:
- What type of extension? → New Extension (TypeScript)
- Extension name → skill-manager
- Extension display name → SkillManager
- Initialize git? → No (already have repo)

**Step 2: Verify project structure**

Run:
```bash
ls -la skill-manager/
```

Expected: `package.json`, `src/`, `tsconfig.json` exist

**Step 3: Move files to root and cleanup**

Run:
```bash
mv skill-manager/* .
mv skill-manager/.vscode .
mv skill-manager/.vscodeignore .
rm -rf skill-manager
```

**Step 4: Install dependencies**

Run:
```bash
npm install
```

Expected: `node_modules/` created, no errors

**Step 5: Verify extension compiles**

Run:
```bash
npm run compile
```

Expected: `out/` folder created with compiled JS

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: scaffold VSCode extension project"
```

---

## Task 2: Define Types

**Files:**
- Create: `src/types/index.ts`

**Step 1: Create types directory**

Run:
```bash
mkdir -p src/types
```

**Step 2: Write type definitions**

Create `src/types/index.ts`:

```typescript
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
 * Metadata from .openskills.json
 */
export interface SkillMetadata {
  source?: string;
  sourceType?: string;
  repoUrl?: string;
  subpath?: string;
  installedAt?: string;
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
```

**Step 3: Verify TypeScript compiles**

Run:
```bash
npm run compile
```

Expected: No errors

**Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add type definitions for Skill, SkillReader, SkillInstallation"
```

---

## Task 3: Default SkillReader Configuration

**Files:**
- Create: `src/config/readers.ts`

**Step 1: Create config directory**

Run:
```bash
mkdir -p src/config
```

**Step 2: Write default readers configuration**

Create `src/config/readers.ts`:

```typescript
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
```

**Step 3: Verify TypeScript compiles**

Run:
```bash
npm run compile
```

Expected: No errors

**Step 4: Commit**

```bash
git add src/config/readers.ts
git commit -m "feat: add default SkillReader configurations with user override support"
```

---

## Task 4: SkillScanner Service

**Files:**
- Create: `src/services/skillScanner.ts`

**Step 1: Create services directory**

Run:
```bash
mkdir -p src/services
```

**Step 2: Write SkillScanner service**

Create `src/services/skillScanner.ts`:

```typescript
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
```

**Step 3: Verify TypeScript compiles**

Run:
```bash
npm run compile
```

Expected: No errors

**Step 4: Commit**

```bash
git add src/services/skillScanner.ts
git commit -m "feat: add SkillScanner service to scan installed skills"
```

---

## Task 5: Sidebar TreeDataProvider

**Files:**
- Create: `src/views/sidebarProvider.ts`
- Modify: `src/extension.ts`
- Modify: `package.json`

**Step 1: Create views directory**

Run:
```bash
mkdir -p src/views
```

**Step 2: Write TreeDataProvider**

Create `src/views/sidebarProvider.ts`:

```typescript
import * as vscode from 'vscode';
import { Skill, SkillInstallation } from '../types';
import { scanSkills, getReaderById } from '../services/skillScanner';

/**
 * Tree item representing a skill in the sidebar
 */
export class SkillTreeItem extends vscode.TreeItem {
  constructor(
    public readonly skill: Skill,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(skill.name, collapsibleState);

    this.tooltip = skill.description || skill.name;
    this.description = this.buildLocationTags();
    this.iconPath = new vscode.ThemeIcon('file-code');
    this.contextValue = 'skill';

    // Command to show detail on click
    this.command = {
      command: 'skillManager.showSkillDetail',
      title: 'Show Skill Detail',
      arguments: [skill],
    };
  }

  /**
   * Build location tags like "[Proj·CC,CX][Glob·GM]"
   */
  private buildLocationTags(): string {
    const projReaders: string[] = [];
    const globReaders: string[] = [];

    for (const install of this.skill.installations) {
      const reader = getReaderById(install.readerId);
      const shortName = reader?.shortName || install.readerId;

      if (install.scope === 'project') {
        if (!projReaders.includes(shortName)) {
          projReaders.push(shortName);
        }
      } else {
        if (!globReaders.includes(shortName)) {
          globReaders.push(shortName);
        }
      }
    }

    const tags: string[] = [];
    if (projReaders.length > 0) {
      tags.push(`[Proj·${projReaders.join(',')}]`);
    }
    if (globReaders.length > 0) {
      tags.push(`[Glob·${globReaders.join(',')}]`);
    }

    return tags.join('');
  }
}

/**
 * Tree item for Markets section
 */
export class MarketsTreeItem extends vscode.TreeItem {
  constructor() {
    super('Markets', vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('package');
    this.contextValue = 'markets';
    this.command = {
      command: 'skillManager.showMarkets',
      title: 'Show Markets',
    };
  }
}

/**
 * TreeDataProvider for the sidebar
 */
export class SkillManagerTreeDataProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private skills: Skill[] = [];

  constructor() {
    this.refresh();
  }

  refresh(): void {
    this.skills = scanSkills();
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (element) {
      // No children for individual items
      return [];
    }

    // Root level: skills + markets
    const items: vscode.TreeItem[] = [];

    for (const skill of this.skills) {
      items.push(new SkillTreeItem(skill, vscode.TreeItemCollapsibleState.None));
    }

    // Add Markets section at the end
    items.push(new MarketsTreeItem());

    return items;
  }

  getSkills(): Skill[] {
    return this.skills;
  }
}
```

**Step 3: Update package.json with view contributions**

Edit `package.json`, add to `contributes` section:

```json
{
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "skillManager",
          "title": "SkillManager",
          "icon": "$(extensions)"
        }
      ]
    },
    "views": {
      "skillManager": [
        {
          "id": "skillManagerView",
          "name": "Skills"
        }
      ]
    },
    "commands": [
      {
        "command": "skillManager.refresh",
        "title": "Refresh Skills",
        "icon": "$(refresh)"
      },
      {
        "command": "skillManager.showSkillDetail",
        "title": "Show Skill Detail"
      },
      {
        "command": "skillManager.showMarkets",
        "title": "Show Markets"
      }
    ],
    "menus": {
      "view/title": [
        {
          "command": "skillManager.refresh",
          "when": "view == skillManagerView",
          "group": "navigation"
        }
      ]
    }
  }
}
```

**Step 4: Update extension.ts**

Replace `src/extension.ts`:

```typescript
import * as vscode from 'vscode';
import { SkillManagerTreeDataProvider } from './views/sidebarProvider';
import { Skill } from './types';

let treeDataProvider: SkillManagerTreeDataProvider;

export function activate(context: vscode.ExtensionContext) {
  // Create and register tree data provider
  treeDataProvider = new SkillManagerTreeDataProvider();
  vscode.window.registerTreeDataProvider('skillManagerView', treeDataProvider);

  // Register refresh command
  const refreshCmd = vscode.commands.registerCommand('skillManager.refresh', () => {
    treeDataProvider.refresh();
    vscode.window.showInformationMessage('Skills refreshed');
  });

  // Register show detail command (placeholder for now)
  const showDetailCmd = vscode.commands.registerCommand(
    'skillManager.showSkillDetail',
    (skill: Skill) => {
      vscode.window.showInformationMessage(`Skill: ${skill.name}`);
    }
  );

  // Register show markets command (placeholder for now)
  const showMarketsCmd = vscode.commands.registerCommand(
    'skillManager.showMarkets',
    () => {
      vscode.window.showInformationMessage('Markets view coming in Milestone 2');
    }
  );

  context.subscriptions.push(refreshCmd, showDetailCmd, showMarketsCmd);
}

export function deactivate() {}
```

**Step 5: Verify TypeScript compiles**

Run:
```bash
npm run compile
```

Expected: No errors

**Step 6: Test extension manually**

Run:
```bash
code --extensionDevelopmentPath=/Users/hongling/Dev/skillManage
```

Expected: SkillManager icon appears in activity bar, shows list of skills with location tags

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: add sidebar TreeDataProvider with skill list and location tags"
```

---

## Task 6: Webview for Skill Detail

**Files:**
- Create: `src/views/skillDetailPanel.ts`
- Modify: `src/extension.ts`

**Step 1: Write SkillDetailPanel**

Create `src/views/skillDetailPanel.ts`:

```typescript
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Skill } from '../types';
import { getReaderById } from '../services/skillScanner';

export class SkillDetailPanel {
  public static currentPanel: SkillDetailPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, skill: Skill) {
    this._panel = panel;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.html = this._getHtmlContent(skill);
  }

  public static show(skill: Skill) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (SkillDetailPanel.currentPanel) {
      SkillDetailPanel.currentPanel._panel.reveal(column);
      SkillDetailPanel.currentPanel._panel.webview.html =
        SkillDetailPanel.currentPanel._getHtmlContent(skill);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'skillDetail',
      `Skill: ${skill.name}`,
      column || vscode.ViewColumn.One,
      {
        enableScripts: false,
      }
    );

    SkillDetailPanel.currentPanel = new SkillDetailPanel(panel, skill);
  }

  private _getHtmlContent(skill: Skill): string {
    // Read SKILL.md content
    let skillMdContent = 'No SKILL.md found';
    if (skill.installations.length > 0) {
      const skillMdPath = path.join(skill.installations[0].path, 'SKILL.md');
      if (fs.existsSync(skillMdPath)) {
        skillMdContent = fs.readFileSync(skillMdPath, 'utf-8');
        // Remove frontmatter for display
        skillMdContent = skillMdContent.replace(/^---\n[\s\S]*?\n---\n/, '');
        // Escape HTML
        skillMdContent = this._escapeHtml(skillMdContent);
      }
    }

    // Build installation locations HTML
    const installationsHtml = this._buildInstallationsHtml(skill);

    // Build source info
    let sourceHtml = '';
    if (skill.metadata?.repoUrl) {
      sourceHtml = `<p><strong>Source:</strong> ${this._escapeHtml(skill.metadata.repoUrl)}</p>`;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Skill: ${this._escapeHtml(skill.name)}</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
    }
    h1 {
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 10px;
    }
    .installations {
      background: var(--vscode-textBlockQuote-background);
      border-left: 3px solid var(--vscode-textBlockQuote-border);
      padding: 10px 15px;
      margin: 15px 0;
    }
    .installation-item {
      margin: 5px 0;
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
    }
    .scope-label {
      font-weight: bold;
      color: var(--vscode-textLink-foreground);
    }
    .content {
      white-space: pre-wrap;
      font-family: var(--vscode-editor-font-family);
      font-size: 13px;
      line-height: 1.5;
    }
    hr {
      border: none;
      border-top: 1px solid var(--vscode-panel-border);
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <h1>${this._escapeHtml(skill.name)}</h1>

  <div class="installations">
    <strong>Installed at:</strong>
    ${installationsHtml}
  </div>

  ${sourceHtml}

  <hr>

  <div class="content">${skillMdContent}</div>
</body>
</html>`;
  }

  private _buildInstallationsHtml(skill: Skill): string {
    const projectInstalls: { reader: string; path: string }[] = [];
    const globalInstalls: { reader: string; path: string }[] = [];

    for (const install of skill.installations) {
      const reader = getReaderById(install.readerId);
      const readerName = reader?.name || install.readerId;

      if (install.scope === 'project') {
        projectInstalls.push({ reader: readerName, path: install.path });
      } else {
        globalInstalls.push({ reader: readerName, path: install.path });
      }
    }

    let html = '';

    if (projectInstalls.length > 0) {
      html += `<div class="installation-item"><span class="scope-label">Project:</span></div>`;
      for (const inst of projectInstalls) {
        html += `<div class="installation-item">&nbsp;&nbsp;└─ ${this._escapeHtml(inst.reader)}: ${this._escapeHtml(inst.path)}</div>`;
      }
    }

    if (globalInstalls.length > 0) {
      html += `<div class="installation-item"><span class="scope-label">Global:</span></div>`;
      for (const inst of globalInstalls) {
        html += `<div class="installation-item">&nbsp;&nbsp;└─ ${this._escapeHtml(inst.reader)}: ${this._escapeHtml(inst.path)}</div>`;
      }
    }

    return html;
  }

  private _escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  public dispose() {
    SkillDetailPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) {
        d.dispose();
      }
    }
  }
}
```

**Step 2: Update extension.ts to use SkillDetailPanel**

Edit `src/extension.ts`, update the showSkillDetail command:

```typescript
import * as vscode from 'vscode';
import { SkillManagerTreeDataProvider } from './views/sidebarProvider';
import { SkillDetailPanel } from './views/skillDetailPanel';
import { Skill } from './types';

let treeDataProvider: SkillManagerTreeDataProvider;

export function activate(context: vscode.ExtensionContext) {
  // Create and register tree data provider
  treeDataProvider = new SkillManagerTreeDataProvider();
  vscode.window.registerTreeDataProvider('skillManagerView', treeDataProvider);

  // Register refresh command
  const refreshCmd = vscode.commands.registerCommand('skillManager.refresh', () => {
    treeDataProvider.refresh();
    vscode.window.showInformationMessage('Skills refreshed');
  });

  // Register show detail command
  const showDetailCmd = vscode.commands.registerCommand(
    'skillManager.showSkillDetail',
    (skill: Skill) => {
      SkillDetailPanel.show(skill);
    }
  );

  // Register show markets command (placeholder for Milestone 2)
  const showMarketsCmd = vscode.commands.registerCommand(
    'skillManager.showMarkets',
    () => {
      vscode.window.showInformationMessage('Markets view coming in Milestone 2');
    }
  );

  context.subscriptions.push(refreshCmd, showDetailCmd, showMarketsCmd);
}

export function deactivate() {}
```

**Step 3: Verify TypeScript compiles**

Run:
```bash
npm run compile
```

Expected: No errors

**Step 4: Test extension manually**

Run:
```bash
code --extensionDevelopmentPath=/Users/hongling/Dev/skillManage
```

Expected: Clicking a skill opens webview panel showing SKILL.md content and installation locations

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Webview panel for skill detail view"
```

---

## Task 7: Configuration Schema

**Files:**
- Modify: `package.json`

**Step 1: Add configuration contribution to package.json**

Add to `contributes` section in `package.json`:

```json
{
  "contributes": {
    "configuration": {
      "title": "SkillManager",
      "properties": {
        "skillManager.readers": {
          "type": "array",
          "default": [],
          "description": "Custom SkillReader configurations. These are merged with built-in defaults.",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "description": "Unique identifier, e.g., 'claude-code'"
              },
              "name": {
                "type": "string",
                "description": "Display name, e.g., 'Claude Code'"
              },
              "shortName": {
                "type": "string",
                "description": "Short label for UI tags, e.g., 'CC'"
              },
              "version": {
                "type": "string",
                "description": "Version constraint, e.g., '>=1.0'"
              },
              "globalPath": {
                "type": "string",
                "description": "Global skill path, e.g., '~/.claude/skills'"
              },
              "projectPath": {
                "type": "string",
                "description": "Project-relative skill path, e.g., '.claude/skills'"
              }
            },
            "required": ["id", "name", "globalPath", "projectPath"]
          }
        }
      }
    }
  }
}
```

**Step 2: Verify TypeScript compiles**

Run:
```bash
npm run compile
```

Expected: No errors

**Step 3: Commit**

```bash
git add package.json
git commit -m "feat: add configuration schema for skillManager.readers"
```

---

## Task 8: Final Cleanup and Testing

**Files:**
- Modify: `README.md`
- Modify: `package.json` (bump version if needed)

**Step 1: Update README.md**

Replace `README.md`:

```markdown
# SkillManager

A VSCode extension to browse and manage AI agent skills installed on your system.

## Features

- **Sidebar View**: See all installed skills at a glance with location tags
- **Skill Details**: Click any skill to view its full documentation
- **Multi-Reader Support**: Works with Claude Code, Codex, Gemini CLI, Antigravity, and more
- **Configurable**: Add custom readers via settings

## Usage

1. Open the SkillManager view from the activity bar
2. Click any skill to see its details
3. Use the refresh button to rescan skills

## Configuration

Add custom readers in `settings.json`:

```json
{
  "skillManager.readers": [
    {
      "id": "my-agent",
      "name": "My Agent",
      "shortName": "MA",
      "globalPath": "~/.myagent/skills",
      "projectPath": ".myagent/skills"
    }
  ]
}
```

## Roadmap

- **Milestone 2**: Market browsing and skill installation
- **Milestone 3**: Update detection and batch operations
```

**Step 2: Test full extension flow**

Run:
```bash
code --extensionDevelopmentPath=/Users/hongling/Dev/skillManage
```

Verify:
1. SkillManager icon appears in activity bar
2. Skills are listed with correct location tags
3. Clicking a skill opens detail view
4. Refresh button works
5. Configuration in settings.json is respected

**Step 3: Commit**

```bash
git add -A
git commit -m "docs: update README with usage and configuration"
```

**Step 4: Tag milestone 1 complete**

```bash
git tag -a v0.1.0 -m "Milestone 1: Local skill browsing"
```

---

## Summary

Milestone 1 complete. The extension now:

- Scans global and project skill directories for all configured readers
- Displays skills in sidebar with location tags `[Proj·CC,CX][Glob·GM]`
- Shows skill detail in webview panel with SKILL.md content
- Supports user-configurable readers via settings.json
