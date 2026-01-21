# SkillManager Milestone 3 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add update detection, batch operations, and search/filter functionality to the SkillManager extension.

**Architecture:** Add UpdateService to compare installed skills with market versions using git commit hashes. Extend MarketPanel with search filter and batch selection UI. Add delete functionality to InstallService.

**Tech Stack:** TypeScript, VSCode Extension API, git CLI for version comparison

---

## Task 1: Add Update Detection Service

**Files:**
- Create: `src/services/updateService.ts`
- Modify: `src/services/marketService.ts`

**Step 1: Add git commit hash to MarketSkill**

Modify `src/services/marketService.ts` to include commit hash:

```typescript
// Add to MarketSkill interface
export interface MarketSkill {
  name: string;
  description?: string;
  market: Market;
  repoPath: string;
  subpath: string;
  commitHash?: string; // Add this field
}

// Update fetchMarketSkills to get commit hash
// After cloning/pulling, get the HEAD commit hash
const commitHash = await execGit(['rev-parse', 'HEAD'], repoDir);
// Include commitHash.trim() in each MarketSkill
```

**Step 2: Create UpdateService**

Create `src/services/updateService.ts`:

```typescript
import * as path from 'path';
import * as fs from 'fs';
import { Skill } from '../types';
import { MarketSkill, fetchMarketSkills, getAllMarkets, getCacheDir } from './marketService';
import { scanSkills } from './skillScanner';

export interface SkillUpdateInfo {
  skill: Skill;
  marketSkill: MarketSkill;
  hasUpdate: boolean;
  installedCommit?: string;
  latestCommit?: string;
}

/**
 * Check if a skill has updates available
 */
export async function checkForUpdates(): Promise<SkillUpdateInfo[]> {
  const updates: SkillUpdateInfo[] = [];
  const installedSkills = scanSkills();
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

    const hasUpdate = installedCommit && latestCommit && installedCommit !== latestCommit;

    updates.push({
      skill,
      marketSkill,
      hasUpdate: !!hasUpdate,
      installedCommit,
      latestCommit,
    });
  }

  return updates;
}

/**
 * Get the commit hash from installed skill metadata
 */
function getInstalledCommit(skill: Skill): string | undefined {
  if (skill.installations.length === 0) {
    return undefined;
  }

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
```

**Step 3: Update InstallService to save commit hash**

Modify `src/services/installService.ts` to include commit hash in metadata:

```typescript
// In installSkill function, update the metadata object:
const metadata = {
  source: `https://github.com/${skill.repoPath}`,
  sourceType: 'git',
  repoUrl: `https://github.com/${skill.repoPath}`,
  subpath: skill.subpath,
  commitHash: skill.commitHash, // Add this line
  installedAt: new Date().toISOString(),
};
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
git commit -m "feat: add update detection service with commit hash tracking"
```

---

## Task 2: Add Delete Skill Functionality

**Files:**
- Modify: `src/services/installService.ts`
- Modify: `src/views/sidebarProvider.ts`
- Modify: `src/extension.ts`
- Modify: `package.json`

**Step 1: Add deleteSkill function to InstallService**

Add to `src/services/installService.ts`:

```typescript
import { Skill, SkillInstallation } from '../types';

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
```

**Step 2: Add delete command to package.json**

Add to `contributes.commands` in `package.json`:

```json
{
  "command": "skillManager.deleteSkill",
  "title": "Delete Skill"
}
```

Add to `contributes.menus`:

```json
"view/item/context": [
  {
    "command": "skillManager.deleteSkill",
    "when": "view == skillManagerView && viewItem == skill",
    "group": "inline"
  }
]
```

**Step 3: Register delete command in extension.ts**

Add to `src/extension.ts`:

```typescript
import { deleteSkill } from './services/installService';

// In activate function:
const deleteCmd = vscode.commands.registerCommand(
  'skillManager.deleteSkill',
  async (item: SkillTreeItem) => {
    const skill = item.skill;
    const confirm = await vscode.window.showWarningMessage(
      `Delete skill "${skill.name}" from all locations?`,
      { modal: true },
      'Delete'
    );

    if (confirm === 'Delete') {
      deleteSkill(skill);
      treeDataProvider.refresh();
      vscode.window.showInformationMessage(`Deleted ${skill.name}`);
    }
  }
);

context.subscriptions.push(refreshCmd, showDetailCmd, showMarketsCmd, deleteCmd);
```

**Step 4: Export SkillTreeItem from sidebarProvider**

Ensure `SkillTreeItem` is exported in `src/views/sidebarProvider.ts` (already done).

**Step 5: Verify TypeScript compiles**

Run:
```bash
npm run compile
```

Expected: No errors

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add delete skill functionality with context menu"
```

---

## Task 3: Add Search/Filter to Sidebar

**Files:**
- Modify: `src/views/sidebarProvider.ts`
- Modify: `src/extension.ts`
- Modify: `package.json`

**Step 1: Add filter state to TreeDataProvider**

Modify `src/views/sidebarProvider.ts`:

```typescript
export class SkillManagerTreeDataProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private skills: Skill[] = [];
  private filterText: string = ''; // Add this

  constructor() {
    this.refresh();
  }

  setFilter(text: string): void {
    this.filterText = text.toLowerCase();
    this._onDidChangeTreeData.fire(undefined);
  }

  refresh(): void {
    this.skills = scanSkills();
    this._onDidChangeTreeData.fire(undefined);
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (element) {
      return [];
    }

    const items: vscode.TreeItem[] = [];

    // Filter skills
    const filteredSkills = this.filterText
      ? this.skills.filter(
          (s) =>
            s.name.toLowerCase().includes(this.filterText) ||
            (s.description && s.description.toLowerCase().includes(this.filterText))
        )
      : this.skills;

    for (const skill of filteredSkills) {
      items.push(new SkillTreeItem(skill, vscode.TreeItemCollapsibleState.None));
    }

    items.push(new MarketsTreeItem());

    return items;
  }

  // ... rest of the class
}
```

**Step 2: Add filter command to package.json**

Add to `contributes.commands`:

```json
{
  "command": "skillManager.filter",
  "title": "Filter Skills",
  "icon": "$(search)"
}
```

Add to `view/title` menu:

```json
{
  "command": "skillManager.filter",
  "when": "view == skillManagerView",
  "group": "navigation"
}
```

**Step 3: Register filter command in extension.ts**

Add to `src/extension.ts`:

```typescript
const filterCmd = vscode.commands.registerCommand('skillManager.filter', async () => {
  const input = await vscode.window.showInputBox({
    placeHolder: 'Filter skills by name or description...',
    prompt: 'Enter search text (leave empty to clear filter)',
  });

  if (input !== undefined) {
    treeDataProvider.setFilter(input);
  }
});

context.subscriptions.push(refreshCmd, showDetailCmd, showMarketsCmd, deleteCmd, filterCmd);
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
git commit -m "feat: add search/filter functionality to sidebar"
```

---

## Task 4: Add Search to Market Panel

**Files:**
- Modify: `src/views/marketPanel.ts`

**Step 1: Add search filter to MarketPanel**

Update `src/views/marketPanel.ts` to add search functionality:

```typescript
export class MarketPanel {
  // ... existing fields
  private _searchText: string = ''; // Add this

  // Update _handleMessage to handle search
  private async _handleMessage(message: { command: string; marketName?: string; skillName?: string; searchText?: string }) {
    switch (message.command) {
      // ... existing cases

      case 'search':
        this._searchText = message.searchText?.toLowerCase() || '';
        this._updateContent();
        break;
    }
  }

  // Update _getHtmlContent to filter skills and add search input
  private _getHtmlContent(): string {
    // ... existing code

    // Filter skills by search text
    const filteredSkills = this._searchText
      ? this._skills.filter(
          (s) =>
            s.name.toLowerCase().includes(this._searchText) ||
            (s.description && s.description.toLowerCase().includes(this._searchText))
        )
      : this._skills;

    // Use filteredSkills instead of this._skills in the map

    // Add search input to HTML controls:
    // <input type="text" id="searchInput" placeholder="Search skills..." oninput="search(this.value)">

    // Add to script:
    // function search(text) {
    //   vscode.postMessage({ command: 'search', searchText: text });
    // }
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
git commit -m "feat: add search filter to market panel"
```

---

## Task 5: Add Update Button to Market Panel

**Files:**
- Modify: `src/views/marketPanel.ts`
- Modify: `src/services/installService.ts`

**Step 1: Add updateSkill function to InstallService**

Add to `src/services/installService.ts`:

```typescript
/**
 * Update a skill by reinstalling from market
 */
export async function updateSkill(options: InstallOptions): Promise<void> {
  // Delete existing installations first
  const installedSkills = scanSkills();
  const existingSkill = installedSkills.find((s) => s.name === options.skill.name);

  if (existingSkill) {
    // Only delete installations that match the target scope/readers
    for (const installation of existingSkill.installations) {
      const matchesScope = installation.scope === options.scope;
      const matchesReader = options.readers.some((r) => r.id === installation.readerId);
      if (matchesScope && matchesReader) {
        deleteSkillInstallation(installation);
      }
    }
  }

  // Reinstall
  await installSkill(options);
}
```

**Step 2: Add update message handler to MarketPanel**

Update `src/views/marketPanel.ts`:

```typescript
import { installSkill, getAvailableReaders, updateSkill } from '../services/installService';

// In _handleMessage:
case 'update':
  if (message.skillName) {
    await this._showUpdateDialog(message.skillName);
  }
  break;

// Add _showUpdateDialog method (similar to _showInstallDialog but calls updateSkill)
private async _showUpdateDialog(skillName: string) {
  const skill = this._skills.find((s) => s.name === skillName);
  if (!skill) {
    return;
  }

  // Same flow as install, but call updateSkill instead
  // ... (same QuickPick flow as _showInstallDialog)

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Updating ${skill.name}...`,
        cancellable: false,
      },
      async () => {
        await updateSkill({
          skill,
          scope: scopeChoice.scope,
          readers: selectedReaders.map((r) => r.reader),
        });
      }
    );

    vscode.window.showInformationMessage(`Successfully updated ${skill.name}`);
    vscode.commands.executeCommand('skillManager.refresh');
    this._updateContent();
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to update ${skill.name}: ${error}`);
  }
}
```

**Step 3: Update HTML to show Update button**

In `_getHtmlContent`, update the button logic:

```typescript
// Check if skill has update available
const hasUpdate = /* compare commits */;

const buttonHtml = isInstalled
  ? hasUpdate
    ? `<button class="update-btn" onclick="update('${this._escapeHtml(skill.name)}')">Update</button>`
    : '<span class="installed-badge">Installed</span>'
  : `<button class="install-btn" onclick="install('${this._escapeHtml(skill.name)}')">Install</button>`;
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
git commit -m "feat: add update skill functionality to market panel"
```

---

## Task 6: Update README and Tag

**Files:**
- Modify: `README.md`

**Step 1: Update README.md**

```markdown
# SkillManager

A VSCode extension to browse and manage AI agent skills installed on your system.

## Features

- **Sidebar View**: See all installed skills at a glance with location tags
- **Skill Details**: Click any skill to view its full documentation
- **Market Browsing**: Browse skills from configured git repositories
- **Skill Installation**: Install skills to project or global scope with reader selection
- **Update Detection**: See which skills have updates available
- **Delete Skills**: Remove skills via context menu
- **Search & Filter**: Filter skills by name or description
- **Multi-Reader Support**: Works with Claude Code, Codex, Gemini CLI, Antigravity, and more
- **Configurable**: Add custom readers and markets via settings

## Usage

1. Open the SkillManager view from the activity bar
2. Click any skill to see its details
3. Click "Markets" to browse available skills
4. Use the search icon to filter skills
5. Right-click a skill to delete it
6. Use the refresh button to rescan skills

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
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README with Milestone 3 features"
```

**Step 3: Tag milestone 3 complete**

```bash
git tag -a v0.3.0 -m "Milestone 3: Update detection, delete, and search/filter"
```

---

## Summary

Milestone 3 complete. The extension now:

- Tracks skill versions using git commit hashes
- Shows update availability in market panel
- Allows updating installed skills
- Supports deleting skills via context menu
- Provides search/filter in sidebar and market panel
