import * as vscode from 'vscode';
import { SkillManagerTreeDataProvider, SkillTreeItem } from './views/sidebarProvider';
import { SkillDetailPanel } from './views/skillDetailPanel';
import { MarketPanel } from './views/marketPanel';
import { Skill } from './types';
import { deleteSkill } from './services/installService';
import { updateAllSkills } from './services/updateService';

let treeDataProvider: SkillManagerTreeDataProvider;

export function activate(context: vscode.ExtensionContext) {
  // Create and register tree data provider
  treeDataProvider = new SkillManagerTreeDataProvider();
  const treeView = vscode.window.registerTreeDataProvider('skillManagerView', treeDataProvider);
  context.subscriptions.push(treeView);

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
      MarketPanel.show();
    }
  );

  // Register delete skill command
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

  // Register filter command
  const filterCmd = vscode.commands.registerCommand('skillManager.filter', async () => {
    const input = await vscode.window.showInputBox({
      placeHolder: 'Filter skills by name or description...',
      prompt: 'Enter search text (leave empty to clear filter)',
    });

    if (input !== undefined) {
      treeDataProvider.setFilter(input);
    }
  });

  // Register update all command
  const updateAllCmd = vscode.commands.registerCommand('skillManager.updateAll', async () => {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Checking for updates...',
        cancellable: false,
      },
      async (progress) => {
        try {
          const updated = await updateAllSkills((message) => progress.report({ message }));
          if (updated.length > 0) {
            vscode.window.showInformationMessage(
              `Updated ${updated.length} skills: ${updated.join(', ')}`
            );
            treeDataProvider.refresh();
          } else {
            vscode.window.showInformationMessage('All skills are up to date');
          }
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to update skills: ${error}`);
        }
      }
    );
  });

  context.subscriptions.push(refreshCmd, showDetailCmd, showMarketsCmd, deleteCmd, filterCmd, updateAllCmd);
}

export function deactivate() { }
