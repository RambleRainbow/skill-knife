import * as vscode from 'vscode';
import { Skill } from '../types';
import { scanSkills } from '../services/skillScanner';

/**
 * Tree item representing a skill in the sidebar
 */
export class SkillTreeItem extends vscode.TreeItem {
  constructor(
    public readonly skill: Skill,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(skill.name, collapsibleState);

    // Determine installation state
    const hasProjectInstall = this.skill.installations.some(i => i.scope === 'project');
    const hasGlobalInstall = this.skill.installations.some(i => i.scope === 'global');

    // Build context value string for unique icon visibility
    const parts = ['skill'];
    parts.push(hasProjectInstall ? 'projInstalled' : 'projMissing');
    parts.push(hasGlobalInstall ? 'globInstalled' : 'globMissing');
    this.contextValue = parts.join('_');

    // Build tooltip with source info
    const source = skill.metadata?.source || 'local';
    const header = `**[${source}] #${skill.name}**`;
    const mdTooltip = new vscode.MarkdownString(`${header}\n\n${skill.description || ''}`);
    mdTooltip.isTrusted = true;
    this.tooltip = mdTooltip;

    // Remove description (hidden tags)
    this.description = '';
    this.iconPath = new vscode.ThemeIcon('file-code');

    // Command to show detail on click
    this.command = {
      command: 'skillKnife.showSkillDetail',
      title: 'Show Skill Detail',
      arguments: [skill],
    };
  }
}

/**
 * TreeDataProvider for the sidebar
 */
export type GroupingMode = 'none' | 'scope';

/**
 * Group item in the tree (Scope or Reader)
 */
export class GroupingItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly scope: 'global' | 'project'
  ) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'skillGroup';
    this.iconPath = new vscode.ThemeIcon(scope === 'global' ? 'globe' : 'project');
  }
}

/**
 * TreeDataProvider for the sidebar
 */
export class SkillKnifeTreeDataProvider
  implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private skills: Skill[] = [];
  private filterText: string = '';
  private groupingMode: GroupingMode = 'none';

  constructor() {
    this.refresh();
  }

  setFilter(text: string): void {
    this.filterText = text.toLowerCase();
    this._onDidChangeTreeData.fire(undefined);
  }

  setGrouping(mode: GroupingMode): void {
    this.groupingMode = mode;
    this.refresh();
  }

  getGroupingMode(): GroupingMode {
    return this.groupingMode;
  }

  refresh(): void {
    this.skills = scanSkills();
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    // 1. Filter skills first
    const filteredSkills = this.filterText
      ? this.skills.filter(
        (s) =>
          s.name.toLowerCase().includes(this.filterText) ||
          (s.description && s.description.toLowerCase().includes(this.filterText))
      )
      : this.skills;

    if (!element) {
      // Root Level
      if (this.groupingMode === 'none') {
        return filteredSkills.map(s => new SkillTreeItem(s, vscode.TreeItemCollapsibleState.None));
      } else {
        // Return fixed two groups: Project, Global
        return [
          new GroupingItem('Project', 'project'),
          new GroupingItem('Global', 'global')
        ];
      }
    }

    if (element instanceof GroupingItem) {
      // Level 2: Scope -> Skills
      const scopeSkills = filteredSkills.filter(s =>
        s.installations.some(i => i.scope === element.scope)
      );
      return scopeSkills.map(s => new SkillTreeItem(s, vscode.TreeItemCollapsibleState.None));
    }

    return [];
  }

  async deleteGroup(item: GroupingItem): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
      `Delete all skills in ${item.label}? This cannot be undone.`,
      { modal: true },
      'Delete All'
    );

    if (confirm !== 'Delete All') return;

    const freshSkills = scanSkills();
    let deleteCount = 0;

    for (const skill of freshSkills) {
      // Find installations matching this group
      const targetInstalls = skill.installations.filter(i => i.scope === item.scope);

      if (targetInstalls.length > 0) {
        // Delete these specific installations
        for (const install of targetInstalls) {
          // Import deleteSkillInstallation
          const { deleteSkillInstallation } = require('../services/installService');
          deleteSkillInstallation(install);
          deleteCount++;
        }
      }
    }

    vscode.window.showInformationMessage(`Deleted ${deleteCount} skill installations.`);
    this.refresh();
  }

  getSkills(): Skill[] {
    return this.skills;
  }
}
