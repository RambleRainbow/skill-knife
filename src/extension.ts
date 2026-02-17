import * as vscode from 'vscode';
import { SkillKnifeTreeDataProvider, SkillTreeItem } from './views/sidebarProvider';
import { SkillDetailPanel } from './views/skillDetailPanel';
import { MarketPanel } from './views/marketPanel';
import { Skill } from './types';
import { deleteSkill } from './services/installService';
import { initCliService, runSkillsCliInteractive, getInstallArgs, getAgentArgs } from './services/cliService';
import { PersistenceService } from './services/persistenceService';

let treeDataProvider: SkillKnifeTreeDataProvider;

export function activate(context: vscode.ExtensionContext) {
  // Initialize CLI Service
  initCliService(context);

  // Create and register tree data provider
  treeDataProvider = new SkillKnifeTreeDataProvider();

  // Register Views (Primary Sidebar)
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('skillKnifeView-sidebar', treeDataProvider)
  );

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
      MarketPanel.show(context.extensionUri);
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
    // New behavior: Run interactive update command
    // "npx skills update" is supported by skills CLI
    runSkillsCliInteractive(['update']);
    vscode.window.showInformationMessage('Launched "npx skills update" in terminal.');
  });

  // Handle configuration changes (only grouping)
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
    const url = item.skill.metadata?.repoUrl || item.skill.metadata?.sourceUrl;
    if (url) {
      vscode.env.openExternal(vscode.Uri.parse(url));
    } else {
      vscode.window.showInformationMessage(`No repository URL found for ${item.skill.name}`);
    }
  });



  // Project Commands
  const installProjectCmd = vscode.commands.registerCommand('skillKnife.installProject', async (item: SkillTreeItem) => {
    try {
      // Interactive install to project
      await runSkillsCliInteractive(['add', ...getInstallArgs(item.skill), ...getAgentArgs(PersistenceService.getPreferredAgents()), '-y']);
      vscode.commands.executeCommand('skillKnife.refresh');
    } catch (e) {
      vscode.window.showErrorMessage('Failed to launch installation');
    }
  });

  const uninstallProjectCmd = vscode.commands.registerCommand('skillKnife.uninstallProject', async (item: SkillTreeItem) => {
    try {
      // Uninstall assumes global removal for now since we don't have granular CLI uninstall
      // Or we can delete just the project installation if we want to be nice
      const projectInstall = item.skill.installations.find(i => i.scope === 'project');
      if (projectInstall) {
        // This is a bit manual, but safer than nuking all?
        // installService.deleteSkill removes everything.
        // Let's stick to full delete for consistency with "uninstall" meaning usually
        const confirm = await vscode.window.showWarningMessage(
          `Uninstall ${item.skill.name}? This will remove it from all scopes.`,
          { modal: true },
          'Uninstall'
        );
        if (confirm === 'Uninstall') {
          deleteSkill(item.skill);
          vscode.window.showInformationMessage(`Uninstalled ${item.skill.name}`);
          treeDataProvider.refresh();
        }
      }
    } catch (e) { }
  });

  // Global Commands
  const installGlobalCmd = vscode.commands.registerCommand('skillKnife.installGlobal', async (_item: SkillTreeItem) => {
    // Visual only
  });

  const uninstallGlobalCmd = vscode.commands.registerCommand('skillKnife.uninstallGlobal', async (_item: SkillTreeItem) => {
    // Visual only
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
    uninstallGlobalCmd,
    // Profile Commands
    // Profile Commands
    vscode.commands.registerCommand('skillKnife.saveProfile', async () => {
      await treeDataProvider.saveProfile();
    }),
    vscode.commands.registerCommand('skillKnife.loadProfile', async () => {
      // Visual Only for now, or implement later
      vscode.window.showInformationMessage('Load Profile feature coming soon.');
    })



  );
}

export function deactivate() { }
