import * as vscode from 'vscode';
import { SkillKnifeTreeDataProvider, SkillTreeItem } from './views/sidebarProvider';
import { SkillDetailPanel } from './views/skillDetailPanel';
import { MarketPanel } from './views/marketPanel';
import { Skill } from './types';
import { deleteSkill } from './services/installService';
import { updateAllSkills } from './services/updateService';
import { initCliService, runOpenSkills, getInstallSource } from './services/cliService';
import { PersistenceService } from './services/persistenceService';
import { scanSkills } from './services/skillScanner';

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
    uninstallGlobalCmd,
    // Profile Commands
    vscode.commands.registerCommand('skillKnife.saveProfile', async () => {
      const skills = scanSkills().filter(s => s.installations.some(i => i.scope === 'project'));
      if (skills.length === 0) {
        vscode.window.showInformationMessage('No project skills to save.');
        return;
      }

      const name = await vscode.window.showInputBox({
        title: 'Save Profile',
        placeHolder: 'Enter profile name',
        validateInput: (value) => value ? null : 'Name is required'
      });

      if (!name) return;

      const profileSkills = skills.map(s => ({
        name: s.name,
        source: getInstallSource(s)
      }));

      PersistenceService.saveProfile({
        name,
        created: Date.now(),
        skills: profileSkills
      });

      vscode.window.showInformationMessage(`Saved profile "${name}" with ${profileSkills.length} skills.`);
    }),

    vscode.commands.registerCommand('skillKnife.loadProfile', async () => {
      const profiles = PersistenceService.getProfiles();
      const items = Object.values(profiles).map(p => ({
        label: p.name,
        description: `${p.skills.length} skills`,
        detail: new Date(p.created).toLocaleString(),
        profile: p
      }));

      if (items.length === 0) {
        vscode.window.showInformationMessage('No saved profiles found.');
        return;
      }

      const selected = await vscode.window.showQuickPick(items, {
        title: 'Load Profile (Sync)',
        placeHolder: 'Select a profile to sync (this will remove extra skills)'
      });

      if (!selected) return;

      const currentSkills = scanSkills();
      const currentNames = new Set(currentSkills.map(s => s.name));
      const profileSkillNames = new Set(selected.profile.skills.map(s => s.name));

      const toInstall = selected.profile.skills.filter(s => !currentNames.has(s.name));

      // Calculate removals (Sync logic enabled by default)
      const toRemove = currentSkills
        .filter(s => !profileSkillNames.has(s.name) && s.installations.some(i => i.scope === 'project'))
        .map(s => s.name);

      if (toInstall.length === 0 && toRemove.length === 0) {
        vscode.window.showInformationMessage('Project is already in sync with profile.');
        return;
      }

      // Confirmation for destructive Sync
      if (toRemove.length > 0) {
        const confirm = await vscode.window.showWarningMessage(
          `Syncing will remove ${toRemove.length} extra skills: ${toRemove.join(', ')}. Continue?`,
          { modal: true },
          'Yes, Sync'
        );
        if (confirm !== 'Yes, Sync') return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Syncing profile "${selected.label}"...`,
          cancellable: false
        },
        async (progress) => {
          // 1. Remove extras
          if (toRemove.length > 0) {
            let rmCount = 0;
            for (const name of toRemove) {
              progress.report({ message: `Removing ${name} (${++rmCount}/${toRemove.length})...` });
              try {
                await runOpenSkills(['remove', name]);
              } catch (e) {
                console.error(`Failed to remove ${name}:`, e);
              }
            }
          }

          // 2. Install missing
          if (toInstall.length > 0) {
            let instCount = 0;
            for (const skill of toInstall) {
              progress.report({ message: `Installing ${skill.name} (${++instCount}/${toInstall.length})...` });
              try {
                await runOpenSkills(['install', skill.source, '--universal']);
              } catch (e) {
                console.error(`Failed to install ${skill.name}:`, e);
                vscode.window.showErrorMessage(`Failed to install ${skill.name}: ${e}`);
              }
            }
          }
        }
      );

      vscode.window.showInformationMessage(`Profile synced successfully.`);
      treeDataProvider.refresh();
    })
  );
}

export function deactivate() { }
