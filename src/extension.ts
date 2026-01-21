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
