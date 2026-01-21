# SkillManager Milestone 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add market browsing and skill installation functionality using openskills CLI.

**Architecture:** Add MarketService to fetch skills from git repos via openskills CLI, create Market webview panel for browsing/searching, add InstallService for installing skills to selected readers. Use VSCode QuickPick for install dialog.

**Tech Stack:** TypeScript, VSCode Extension API, openskills CLI (npm package), child_process for CLI execution

---

## Task 1: Add Market Configuration

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/config/readers.ts`
- Create: `src/config/markets.ts`
- Modify: `package.json`

**Step 1: Add Market type (already exists in types/index.ts)**

Verify `src/types/index.ts` already has:

```typescript
export interface Market {
  name: string;
  git: string;
}
```

**Step 2: Create markets configuration**

Create `src/config/markets.ts`:

```typescript
import * as vscode from 'vscode';
import { Market } from '../types';

/**
 * Built-in default market configurations
 */
export const DEFAULT_MARKETS: Market[] = [
  {
    name: 'Anthropic Official',
    git: 'anthropics/skills',
  },
  {
    name: 'Superpowers',
    git: 'obra/superpowers',
  },
];

/**
 * Get merged markets from default + user configuration
 */
export function getMarkets(): Market[] {
  const config = vscode.workspace.getConfiguration('skillManager');
  const userMarkets = config.get<Market[]>('markets');

  // If user has configured markets, use only those (complete override)
  if (userMarkets && userMarkets.length > 0) {
    return userMarkets;
  }

  return DEFAULT_MARKETS;
}
```

**Step 3: Add markets configuration schema to package.json**

Add to `contributes.configuration.properties` in `package.json`:

```json
"skillManager.markets": {
  "type": "array",
  "default": [],
  "description": "Skill markets (git repositories). If configured, replaces built-in defaults.",
  "items": {
    "type": "object",
    "properties": {
      "name": {
        "type": "string",
        "description": "Display name for the market"
      },
      "git": {
        "type": "string",
        "description": "Git repository path, e.g., 'anthropics/skills' or full URL"
      }
    },
    "required": ["name", "git"]
  }
}
```

**Step 4: Verify TypeScript compiles**

Run:
```bash
npm run compile
```

Expected: No errors

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add market configuration with default markets"
```

---

## Task 2: Create MarketService

**Files:**
- Create: `src/services/marketService.ts`

**Step 1: Create MarketService**

Create `src/services/marketService.ts`:

```typescript
import * as vscode from 'vscode';
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
 * Execute openskills CLI command
 */
async function execOpenskills(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const child = cp.spawn(cmd, ['openskills', ...args], {
      cwd: cwd || os.homedir(),
      shell: true,
    });

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
        reject(new Error(stderr || `openskills exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Fetch skills list from a git repository by cloning/updating locally
 */
export async function fetchMarketSkills(market: Market): Promise<MarketSkill[]> {
  const skills: MarketSkill[] = [];

  try {
    // Clone or update the repo to a temp location
    const cacheDir = path.join(os.homedir(), '.skill-manager', 'cache');
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
 * Get all configured markets
 */
export function getAllMarkets(): Market[] {
  return getMarkets();
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
git add src/services/marketService.ts
git commit -m "feat: add MarketService for fetching skills from git repos"
```

---

## Task 3: Create InstallService

**Files:**
- Create: `src/services/installService.ts`

**Step 1: Create InstallService**

Create `src/services/installService.ts`:

```typescript
import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { SkillReader, SkillScope } from '../types';
import { getReaders } from '../config/readers';
import { MarketSkill } from './marketService';

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
  const cacheDir = path.join(os.homedir(), '.skill-manager', 'cache');
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
```

**Step 2: Verify TypeScript compiles**

Run:
```bash
npm run compile
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/services/installService.ts
git commit -m "feat: add InstallService for installing skills to readers"
```

---

## Task 4: Create Market Webview Panel

**Files:**
- Create: `src/views/marketPanel.ts`

**Step 1: Create MarketPanel**

Create `src/views/marketPanel.ts`:

```typescript
import * as vscode from 'vscode';
import { Market } from '../types';
import { MarketSkill, fetchMarketSkills, getAllMarkets } from '../services/marketService';
import { installSkill, getAvailableReaders } from '../services/installService';
import { getReaders } from '../config/readers';
import { scanSkills } from '../services/skillScanner';

export class MarketPanel {
  public static currentPanel: MarketPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _markets: Market[] = [];
  private _currentMarket: Market | undefined;
  private _skills: MarketSkill[] = [];
  private _loading: boolean = false;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._markets = getAllMarkets();
    this._currentMarket = this._markets[0];

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (message) => this._handleMessage(message),
      null,
      this._disposables
    );

    this._updateContent();
    this._loadSkills();
  }

  public static show(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (MarketPanel.currentPanel) {
      MarketPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'skillMarket',
      'Skill Markets',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
      }
    );

    MarketPanel.currentPanel = new MarketPanel(panel, extensionUri);
  }

  private async _loadSkills() {
    if (!this._currentMarket) {
      return;
    }

    this._loading = true;
    this._updateContent();

    try {
      this._skills = await fetchMarketSkills(this._currentMarket);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to load skills: ${error}`);
      this._skills = [];
    }

    this._loading = false;
    this._updateContent();
  }

  private async _handleMessage(message: any) {
    switch (message.command) {
      case 'selectMarket':
        const market = this._markets.find((m) => m.name === message.marketName);
        if (market) {
          this._currentMarket = market;
          await this._loadSkills();
        }
        break;

      case 'install':
        await this._showInstallDialog(message.skillName);
        break;

      case 'refresh':
        await this._loadSkills();
        break;
    }
  }

  private async _showInstallDialog(skillName: string) {
    const skill = this._skills.find((s) => s.name === skillName);
    if (!skill) {
      return;
    }

    // Step 1: Select scope
    const scopeChoice = await vscode.window.showQuickPick(
      [
        { label: 'Project', description: 'Install to current project', scope: 'project' as const },
        { label: 'Global', description: 'Install globally', scope: 'global' as const },
      ],
      { placeHolder: 'Select installation scope' }
    );

    if (!scopeChoice) {
      return;
    }

    // Step 2: Select readers
    const readers = getAvailableReaders();
    const readerChoices = readers.map((r) => ({
      label: r.name,
      picked: true,
      reader: r,
    }));

    const selectedReaders = await vscode.window.showQuickPick(readerChoices, {
      placeHolder: 'Select target readers',
      canPickMany: true,
    });

    if (!selectedReaders || selectedReaders.length === 0) {
      return;
    }

    // Install
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Installing ${skill.name}...`,
          cancellable: false,
        },
        async () => {
          await installSkill({
            skill,
            scope: scopeChoice.scope,
            readers: selectedReaders.map((r) => r.reader),
          });
        }
      );

      vscode.window.showInformationMessage(`Successfully installed ${skill.name}`);

      // Refresh the sidebar
      vscode.commands.executeCommand('skillManager.refresh');

      // Update the market panel to show installed status
      this._updateContent();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to install ${skill.name}: ${error}`);
    }
  }

  private _updateContent() {
    this._panel.webview.html = this._getHtmlContent();
  }

  private _getHtmlContent(): string {
    const installedSkills = scanSkills();
    const installedNames = new Set(installedSkills.map((s) => s.name));

    const marketOptions = this._markets
      .map((m) => {
        const selected = m.name === this._currentMarket?.name ? 'selected' : '';
        return `<option value="${this._escapeHtml(m.name)}" ${selected}>${this._escapeHtml(m.name)}</option>`;
      })
      .join('');

    let skillsHtml: string;
    if (this._loading) {
      skillsHtml = '<div class="loading">Loading skills...</div>';
    } else if (this._skills.length === 0) {
      skillsHtml = '<div class="empty">No skills found in this market</div>';
    } else {
      skillsHtml = this._skills
        .map((skill) => {
          const isInstalled = installedNames.has(skill.name);
          const buttonHtml = isInstalled
            ? '<span class="installed-badge">Installed</span>'
            : `<button class="install-btn" onclick="install('${this._escapeHtml(skill.name)}')">Install</button>`;

          return `
            <div class="skill-card">
              <div class="skill-header">
                <span class="skill-name">${this._escapeHtml(skill.name)}</span>
                ${buttonHtml}
              </div>
              <div class="skill-description">${this._escapeHtml(skill.description || 'No description')}</div>
            </div>
          `;
        })
        .join('');
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Skill Markets</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 10px;
    }
    h1 {
      margin: 0;
      font-size: 1.5em;
    }
    .controls {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    select {
      padding: 5px 10px;
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: 3px;
    }
    button {
      padding: 5px 10px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 3px;
      cursor: pointer;
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .skill-card {
      background: var(--vscode-editor-inactiveSelectionBackground);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 5px;
      padding: 15px;
      margin-bottom: 10px;
    }
    .skill-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .skill-name {
      font-weight: bold;
      font-size: 1.1em;
    }
    .skill-description {
      color: var(--vscode-descriptionForeground);
      font-size: 0.9em;
    }
    .install-btn {
      padding: 3px 12px;
      font-size: 0.85em;
    }
    .installed-badge {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 3px 8px;
      border-radius: 3px;
      font-size: 0.8em;
    }
    .loading, .empty {
      text-align: center;
      padding: 40px;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Skill Markets</h1>
    <div class="controls">
      <select id="marketSelect" onchange="selectMarket(this.value)">
        ${marketOptions}
      </select>
      <button onclick="refresh()">Refresh</button>
    </div>
  </div>

  <div class="skills-list">
    ${skillsHtml}
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function selectMarket(name) {
      vscode.postMessage({ command: 'selectMarket', marketName: name });
    }

    function install(skillName) {
      vscode.postMessage({ command: 'install', skillName: skillName });
    }

    function refresh() {
      vscode.postMessage({ command: 'refresh' });
    }
  </script>
</body>
</html>`;
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
    MarketPanel.currentPanel = undefined;
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

**Step 2: Verify TypeScript compiles**

Run:
```bash
npm run compile
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/views/marketPanel.ts
git commit -m "feat: add Market webview panel for browsing and installing skills"
```

---

## Task 5: Wire Up Extension

**Files:**
- Modify: `src/extension.ts`

**Step 1: Update extension.ts**

Update `src/extension.ts`:

```typescript
import * as vscode from 'vscode';
import { SkillManagerTreeDataProvider } from './views/sidebarProvider';
import { SkillDetailPanel } from './views/skillDetailPanel';
import { MarketPanel } from './views/marketPanel';
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

  // Register show markets command
  const showMarketsCmd = vscode.commands.registerCommand(
    'skillManager.showMarkets',
    () => {
      MarketPanel.show(context.extensionUri);
    }
  );

  context.subscriptions.push(refreshCmd, showDetailCmd, showMarketsCmd);
}

export function deactivate() {}
```

**Step 2: Verify TypeScript compiles**

Run:
```bash
npm run compile
```

Expected: No errors

**Step 3: Test extension manually**

Run:
```bash
code --extensionDevelopmentPath=/Users/hongling/Dev/skillManage
```

Verify:
1. Click "Markets" in sidebar opens Market webview
2. Market dropdown shows available markets
3. Skills load from selected market
4. Install button opens scope/reader selection
5. After install, skill appears in sidebar

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: wire up MarketPanel to extension commands"
```

---

## Task 6: Update README and Tag

**Files:**
- Modify: `README.md`

**Step 1: Update README.md**

Update `README.md` to include Milestone 2 features:

```markdown
# SkillManager

A VSCode extension to browse and manage AI agent skills installed on your system.

## Features

- **Sidebar View**: See all installed skills at a glance with location tags
- **Skill Details**: Click any skill to view its full documentation
- **Market Browsing**: Browse skills from configured git repositories
- **Skill Installation**: Install skills to project or global scope with reader selection
- **Multi-Reader Support**: Works with Claude Code, Codex, Gemini CLI, Antigravity, and more
- **Configurable**: Add custom readers and markets via settings

## Usage

1. Open the SkillManager view from the activity bar
2. Click any skill to see its details
3. Click "Markets" to browse available skills
4. Use the refresh button to rescan skills

## Configuration

### Custom Readers

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

### Custom Markets

Add custom skill markets:

```json
{
  "skillManager.markets": [
    {
      "name": "My Skills",
      "git": "myorg/my-skills"
    }
  ]
}
```

## Roadmap

- **Milestone 3**: Update detection and batch operations
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README with Milestone 2 features"
```

**Step 3: Tag milestone 2 complete**

```bash
git tag -a v0.2.0 -m "Milestone 2: Market browsing and skill installation"
```

---

## Summary

Milestone 2 complete. The extension now:

- Supports configurable skill markets (git repositories)
- Provides Market webview for browsing available skills
- Allows installing skills to project/global scope
- Supports selecting target readers during installation
- Shows installed status in market view
