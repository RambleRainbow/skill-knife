import * as vscode from 'vscode';
import { SkillKnifeTreeDataProvider, SkillTreeItem } from './views/sidebarProvider';
import { SkillDetailPanel } from './views/skillDetailPanel';
import { MarketPanel } from './views/marketPanel';
import { Skill } from './types';
import { deleteSkill } from './services/installService';
import { updateAllSkills } from './services/updateService';
import { initCliService, runOpenSkills, getInstallSource } from './services/cliService';

let treeDataProvider: SkillKnifeTreeDataProvider;

export function activate(context: vscode.ExtensionContext) {
  // Initialize CLI Service
  initCliService(context);

  // Create and register tree data provider
  treeDataProvider = new SkillKnifeTreeDataProvider();
  const treeView = vscode.window.registerTreeDataProvider('skillKnifeView', treeDataProvider);
  context.subscriptions.push(treeView);

  // Register refresh command
  const refreshCmd = vscode.commands.registerCommand('skillKnife.refresh', () => {
    treeDataProvider.refresh();
    vscode.window.showInformationMessage('Skills refreshed');
  });

  // Register show detail command
  const showDetailCmd = vscode.commands.registerCommand(
    'skillKnife.showSkillDetail',
    (skill: Skill) => {
      SkillDetailPanel.show(skill);
    }
  );

  // Register show markets command
  const showMarketsCmd = vscode.commands.registerCommand(
    'skillKnife.showMarkets',
    () => {
      MarketPanel.show();
    }
  );

  // Register delete skill command
  const deleteCmd = vscode.commands.registerCommand(
    'skillKnife.deleteSkill',
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
  const filterCmd = vscode.commands.registerCommand('skillKnife.filter', async () => {
    const input = await vscode.window.showInputBox({
      placeHolder: 'Filter skills by name or description...',
      prompt: 'Enter search text (leave empty to clear filter)',
    });

    if (input !== undefined) {
      treeDataProvider.setFilter(input);
    }
  });

  // Register update all command
  const updateAllCmd = vscode.commands.registerCommand('skillKnife.updateAll', async () => {
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

  // Handle configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('skillKnife.defaultGrouping')) {
        const mode = vscode.workspace.getConfiguration('skillKnife').get<string>('defaultGrouping') as 'none' | 'scope';
        treeDataProvider.setGrouping(mode || 'none');
      }
    })
  );

  // Initialize grouping from config
  const initialGrouping = vscode.workspace.getConfiguration('skillKnife').get<string>('defaultGrouping') as 'none' | 'scope';
  treeDataProvider.setGrouping(initialGrouping || 'none');

  // Register delete group command
  const deleteGroupCmd = vscode.commands.registerCommand('skillKnife.deleteGroup', async (item: any) => {
    // item is GroupingItem from sidebarProvider
    if (item && item.contextValue === 'skillGroup') {
      await treeDataProvider.deleteGroup(item);
    }
  });

  // Register open repo command
  const openRepoCmd = vscode.commands.registerCommand('skillKnife.openRepo', async (item: SkillTreeItem) => {
    const url = item.skill.metadata?.repoUrl;
    if (url) {
      vscode.env.openExternal(vscode.Uri.parse(url));
    } else {
      vscode.window.showInformationMessage(`No repository URL found for ${item.skill.name}`);
    }
  });

  // Project Commands
  const installProjectCmd = vscode.commands.registerCommand('skillKnife.installProject', async (item: SkillTreeItem) => {
    try {
      const source = getInstallSource(item.skill);
      await runOpenSkills(['install', source]);
      vscode.window.showInformationMessage(`Installed ${item.skill.name} to Project`);
      treeDataProvider.refresh();
    } catch (e) {
      // Error handled in runOpenSkills
    }
  });

  const uninstallProjectCmd = vscode.commands.registerCommand('skillKnife.uninstallProject', async (item: SkillTreeItem) => {
    try {
      await runOpenSkills(['remove', item.skill.name]);
      vscode.window.showInformationMessage(`Uninstalled ${item.skill.name} from Project`);
      treeDataProvider.refresh();
    } catch (e) { }
  });

  // Global Commands
  const installGlobalCmd = vscode.commands.registerCommand('skillKnife.installGlobal', async (_item: SkillTreeItem) => {
    // Global installation disabled - visual only
    /*
    try {
      const source = getInstallSource(item.skill);
      await runOpenSkills(['install', source, '--global']);
      vscode.window.showInformationMessage(`Installed ${item.skill.name} Globally`);
      treeDataProvider.refresh();
    } catch (e) { }
    */
  });

  const uninstallGlobalCmd = vscode.commands.registerCommand('skillKnife.uninstallGlobal', async (_item: SkillTreeItem) => {
    // Global uninstallation disabled - visual only
    /*
    try {
      const source = getInstallSource(item.skill);
      await runOpenSkills(['remove', source]);
      vscode.window.showInformationMessage(`Uninstalled ${item.skill.name} Globally`);
      treeDataProvider.refresh();
    } catch (e) { }
    */
  });

  context.subscriptions.push(
    refreshCmd,
    showDetailCmd,
    showMarketsCmd,
    deleteCmd,
    filterCmd,
    updateAllCmd,
    deleteGroupCmd,
    openRepoCmd,
    installProjectCmd,
    uninstallProjectCmd,
    installGlobalCmd,
    uninstallGlobalCmd
  );
}

export function deactivate() { }
