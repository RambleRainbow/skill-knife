import * as vscode from 'vscode';
import { Skill } from '../types';
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
  private filterText: string = '';

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

    // Add Markets section at the end
    items.push(new MarketsTreeItem());

    return items;
  }

  getSkills(): Skill[] {
    return this.skills;
  }
}
