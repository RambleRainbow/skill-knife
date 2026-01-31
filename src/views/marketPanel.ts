import * as vscode from 'vscode';
import { Market, Skill } from '../types';
import { MarketSkill, fetchMarketSkills, getAllMarkets } from '../services/marketService';
// import { hasUpdateAvailable } from '../services/updateService'; // Removed unused import
import { runSkillsCliInteractive, getInstallArgs, getAgentArgs } from '../services/cliService';
import { PersistenceService } from '../services/persistenceService';
import { DEFAULT_MARKETS } from '../config/defaults';

import { SkillShService } from '../services/skillShService';
import { getReaders } from '../config/readers';

const SKILL_SH_MARKET: Market = {
  name: "Global Search (skills.sh)",
  git: "internal://skills.sh"
};

export class MarketPanel {
  public static currentPanel: MarketPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _markets: Market[] = [];
  private _currentMarket: Market | undefined;
  private _skills: MarketSkill[] = [];
  private _globalCache: MarketSkill[] = [];
  private _installedSkills: Skill[] = []; // Cache for async loaded skills
  private _loading: boolean = false;
  private _searchText: string = '';

  private async _refreshInstalledSkills() {
    // Non-blocking refresh
    const { scanSkillsAsync } = require('../services/skillScanner');
    this._installedSkills = await scanSkillsAsync();
    this._postStateUpdate();
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    //TODO: add custom markets
    // this._markets = [SKILL_SH_MARKET, ...getAllMarkets()];
    this._markets = [SKILL_SH_MARKET];
    this._currentMarket = this._markets[0];

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (message) => this._handleMessage(message),
      null,
      this._disposables
    );

    this._updateContent();
    this._refreshInstalledSkills(); // Trigger async load
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
    this._postStateUpdate();

    if (this._currentMarket?.name === SKILL_SH_MARKET.name) {
      if (this._globalCache.length > 0) {
        this._skills = [...this._globalCache];
      } else {
        // Fetch featured skills on first load
        try {
          const results = await SkillShService.getFeaturedSkills();
          this._skills = this._mapSkillShResults(results);
          this._globalCache = [...this._skills];

          // Background details
          if (results.length > 0) {
            this._fetchDetailsInBackground(results);
          }
        } catch (e) {
          console.error('Failed to load featured skills', e);
          this._skills = [];
        }
      }

      this._loading = false;
      this._postStateUpdate();
      return;
    }

    try {
      this._skills = await fetchMarketSkills(this._currentMarket);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to load skills: ${error}`);
      this._skills = [];
    }

    this._loading = false;
    this._postStateUpdate();
  }

  private async _handleMessage(message: { command: string; marketName?: string; skillName?: string; searchText?: string; agents?: string[]; scope?: string }) {
    switch (message.command) {
      case 'selectMarket':
        const market = this._markets.find((m) => m.name === message.marketName);
        if (market) {
          this._currentMarket = market;
          await this._loadSkills();
        }
        break;

      case 'install':
        if (message.skillName) {
          await this._showInstallDialog(message.skillName);
          this._refreshInstalledSkills();
        }
        break;

      case 'update':
        if (message.skillName) {
          await this._showUpdateDialog(message.skillName);
          this._refreshInstalledSkills();
        }
        break;

      case 'uninstall':
        if (message.skillName) {
          await this._showUninstallDialog(message.skillName, message.scope);
          this._refreshInstalledSkills();
        }
        break;

      case 'search':
        this._searchText = message.searchText?.toLowerCase() || '';

        if (this._currentMarket?.name === SKILL_SH_MARKET.name) {
          // Trigger API search
          await this._handleGlobalSearch(this._searchText);
        }
        // For other markets, filtering is client-side, handled by JS in webview
        break;

      case 'refresh':
        await this._loadSkills();
        this._refreshInstalledSkills();
        break;

      case 'installAll':
        await this._installAllVisible();
        this._refreshInstalledSkills();
        break;

      case 'uninstallAll':
        await this._uninstallAllVisible();
        this._refreshInstalledSkills();
        break;

      case 'addMarket':
        await this._handleAddMarket();
        break;

      case 'deleteMarket':
        if (message.marketName) {
          await this._handleDeleteMarket(message.marketName);
        }
        break;

      case 'saveSettings':
        if (message.agents) {
          PersistenceService.savePreferredAgents(message.agents);
          vscode.window.showInformationMessage('Installation settings saved');
          // No need to reload skills, but maybe update content to reflect state if needed
          this._postStateUpdate();
        }
        break;
    }
  }

  // Helper to send state update without full reload
  private _postStateUpdate() {
    this._panel.webview.postMessage({
      command: 'updateState',
      state: {
        markets: this._markets,
        skills: this._skills,
        loading: this._loading,
        searchText: this._searchText,
        currentMarket: this._currentMarket, // Update market if changed
        installedSkills: this._installedSkills
      }
    });
  }

  private async _handleGlobalSearch(query: string) {
    if (!query || query.length < 2) {
      // Restore default list
      if (this._globalCache.length > 0) {
        this._skills = [...this._globalCache];
      } else {
        this._skills = [];
      }
      this._postStateUpdate(); // Use partial update
      return;
    }

    this._loading = true;
    this._postStateUpdate();

    let results: any[] = [];

    try {
      results = await SkillShService.search(query);

      // Map to MarketSkill
      this._skills = results.map(r => ({
        name: r.name, // e.g. "docker-expert"
        description: `Installs: ${r.installs}`, // Store installs in description for now
        market: this._currentMarket!,
        repoPath: r.topSource, // e.g. "sickn33/antigravity-awesome-skills"
        subpath: r.name,
        commitHash: 'HEAD'
      }));

    } catch (error) {
      vscode.window.showErrorMessage(`Global search failed: ${error}`);
      this._skills = [];
    }

    this._loading = false;
    this._postStateUpdate();

    // Trigger background fetch for details
    if (results.length > 0) {
      this._fetchDetailsInBackground(results);
    }
  }

  private _mapSkillShResults(results: any[]): MarketSkill[] {
    return results.map(r => ({
      name: r.name, // e.g. "docker-expert"
      description: `Installs: ${r.installs}`, // Store installs in description for now
      market: this._currentMarket!,
      repoPath: r.topSource, // e.g. "sickn33/antigravity-awesome-skills"
      subpath: r.name,
      commitHash: 'HEAD'
    }));
  }

  private async _fetchDetailsInBackground(results: any[]) {
    // Limit concurrency via simple loop or P-Limit (using sequential for kindness)
    for (const result of results) {
      if (this._currentMarket?.name !== SKILL_SH_MARKET.name) break; // Stop if user switched markets

      try {
        const details = await SkillShService.getSkillDetails(result);
        if (details.description || details.installCmd) {
          // Send update to webview
          this._panel.webview.postMessage({
            command: 'updateSkill',
            skillName: result.name,
            description: details.description,
            installCmd: details.installCmd
          });
        }
      } catch (e) {
        console.error(`Bg fetch failed for ${result.name}`, e);
      }
    }
  }

  // Helper method to send state updates instead of full reload (Optional optimization for future)
  // private _postStateUpdate() { ... }

  private async _installAllVisible() {
    // 1. Identify skills to install (visible & not installed)
    const installedNames = new Set(this._installedSkills.map((s) => s.name));

    let visibleSkills = this._skills;
    if (this._searchText) {
      visibleSkills = this._skills.filter(
        (s) =>
          s.name.toLowerCase().includes(this._searchText) ||
          (s.description && s.description.toLowerCase().includes(this._searchText))
      );
    }

    const skillsToInstall = visibleSkills.filter((s) => !installedNames.has(s.name));

    if (skillsToInstall.length === 0) {
      vscode.window.showInformationMessage('No uninstalled skills found in current view.');
      return;
    }

    const confirm = await vscode.window.showInformationMessage(
      `Install ${skillsToInstall.length} skills?`,
      'Yes',
      'No'
    );

    if (confirm !== 'Yes') {
      return;
    }

    // 2. Batched Installation
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Batch Installing Skills...',
        cancellable: false,
      },
      async (progress) => {
        let count = 0;
        const total = skillsToInstall.length;
        const errors: string[] = [];

        for (const skill of skillsToInstall) {
          progress.report({ message: `Installing ${skill.name} (${++count}/${total})...` });
          try {
            // Interactive install
            const args = ['add', ...getInstallArgs(skill), ...getAgentArgs(PersistenceService.getPreferredAgents()), '-y'];
            await runSkillsCliInteractive(args);
          } catch (error) {
            console.error(`Failed to install ${skill.name}:`, error);
            errors.push(`${skill.name}: ${error}`);
          }
        }

        if (errors.length > 0) {
          vscode.window.showErrorMessage(
            `Installed ${total - errors.length}/${total} skills. Failures: ${errors.join(', ')}`
          );
        } else {
          vscode.window.showInformationMessage(`Launched installation for ${total} skills.`);
        }
      }
    );

    // Refresh UI
    vscode.commands.executeCommand('skillKnife.refresh');
    this._refreshInstalledSkills();
  }

  private async _uninstallAllVisible() {
    // 1. Identify skills to uninstall (visible & installed)
    const installedNames = new Set(this._installedSkills.map((s) => s.name));

    let visibleSkills = this._skills;
    if (this._searchText) {
      visibleSkills = this._skills.filter(
        (s) =>
          s.name.toLowerCase().includes(this._searchText) ||
          (s.description && s.description.toLowerCase().includes(this._searchText))
      );
    }

    const skillsToUninstall = visibleSkills.filter((s) => installedNames.has(s.name));

    // Map visible market skills to actual installed Skill objects
    const targets = this._installedSkills.filter(s => skillsToUninstall.some(m => m.name === s.name));

    if (targets.length === 0) {
      vscode.window.showInformationMessage('No installed skills found in current view.');
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Uninstall ${targets.length} skills from this market?`,
      { modal: true },
      'Yes, Uninstall All'
    );

    if (confirm !== 'Yes, Uninstall All') {
      return;
    }

    // 2. Batched Uninstallation
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Batch Uninstalling Skills...',
        cancellable: false,
      },
      async (progress) => {
        let count = 0;
        const total = targets.length;
        const errors: string[] = [];

        for (const skill of targets) {
          progress.report({ message: `Uninstalling ${skill.name} (${++count}/${total})...` });
          try {
            const args = ['remove', skill.name, ...getAgentArgs(PersistenceService.getPreferredAgents()), '-y'];
            await runSkillsCliInteractive(args);
          } catch (error) {
            console.error(`Failed to uninstall ${skill.name}:`, error);
            errors.push(`${skill.name}: ${error}`);
          }
        }

        if (errors.length > 0) {
          vscode.window.showErrorMessage(
            `Uninstalled ${total - errors.length}/${total} skills. Failures: ${errors.join(', ')}`
          );
        } else {
          vscode.window.showInformationMessage(`Successfully uninstalled ${total} skills.`);
        }
      }
    );

    // Refresh UI
    vscode.commands.executeCommand('skillKnife.refresh');
    this._refreshInstalledSkills();
  }

  private async _showInstallDialog(skillName: string) {
    const skill = this._skills.find((s) => s.name === skillName);
    if (!skill) {
      return;
    }

    // Direct Install (Project + Universal)
    try {
      const args = ['add', ...getInstallArgs(skill), ...getAgentArgs(PersistenceService.getPreferredAgents()), '-y'];

      // We can't easily wait for interactive terminal, so we show info and launch
      await runSkillsCliInteractive(args);

      vscode.window.showInformationMessage(`Installation for ${skill.name} completed.`);

      // Refresh views
      vscode.commands.executeCommand('skillKnife.refresh'); // Sidebar
      this._loadSkills(); // Market Panel
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to install ${skill.name}: ${error}`);
    }
  }

  private async _showUpdateDialog(skillName: string) {
    const skill = this._skills.find((s) => s.name === skillName);
    if (!skill) {
      return;
    }

    // Direct Update using "add" to reinstall/update
    try {
      const args = ['add', ...getInstallArgs(skill), ...getAgentArgs(PersistenceService.getPreferredAgents()), '-y'];

      await runSkillsCliInteractive(args);

      vscode.window.showInformationMessage(`Update for ${skill.name} completed.`);

      // Refresh views
      vscode.commands.executeCommand('skillKnife.refresh'); // Sidebar
      this._loadSkills(); // Market Panel
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to update ${skill.name}: ${error}`);
    }
  }

  private async _showUninstallDialog(skillName: string, scope?: string) {
    try {
      // Find installed skill to delete
      const skill = this._installedSkills.find(s => s.name === skillName);

      if (!skill) {
        vscode.window.showErrorMessage(`Skill ${skillName} is not recognized as installed.`);
        return;
      }

      // Logic to determine scope if not provided
      let targetScope = scope;
      if (!targetScope) {
        const scopes = new Set(skill.installations.map(i => i.scope));
        if (scopes.size > 1) {
          // Ask user
          targetScope = await vscode.window.showQuickPick(['project', 'global'], {
            placeHolder: `Select scope to uninstall ${skillName} from`
          });
          if (!targetScope) return;
        } else {
          targetScope = skill.installations[0].scope;
        }
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Uninstalling ${skillName}...`,
          cancellable: false,
        },
        async () => {
          const scopeFlag = targetScope === 'global' ? '-g' : '';
          const args = ['remove', skillName];
          if (scopeFlag) args.push(scopeFlag);

          args.push(...getAgentArgs(PersistenceService.getPreferredAgents()));
          args.push('-y');

          await runSkillsCliInteractive(args);
        }
      );

      vscode.window.showInformationMessage(`Successfully uninstalled ${skillName}`);
      vscode.commands.executeCommand('skillKnife.refresh');
      this._refreshInstalledSkills();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to uninstall ${skillName}: ${error}`);
    }
  }

  private async _handleAddMarket() {
    const name = await vscode.window.showInputBox({
      title: 'Add Custom Market',
      placeHolder: 'Enter market name',
      validateInput: (value) => {
        if (!value) return 'Name is required';
        if (this._markets.some(m => m.name === value)) return 'Market with this name already exists';
        return null;
      }
    });

    if (!name) return;

    const git = await vscode.window.showInputBox({
      title: 'Add Custom Market',
      placeHolder: 'Enter git repository URL or "owner/repo"',
      validateInput: (value) => value ? null : 'Repository is required'
    });

    if (!git) return;

    // Add to persistence
    const currentCustom = PersistenceService.getUserMarkets();
    const newMarket = { name, git };
    PersistenceService.saveUserMarkets([...currentCustom, newMarket]);

    vscode.window.showInformationMessage(`Added market "${name}"`);

    // Refresh markets list and UI
    // Refresh markets list and UI
    this._markets = [SKILL_SH_MARKET, ...getAllMarkets()]; // Reload from source

    // Select the new market
    this._currentMarket = this._markets.find(m => m.name === name);
    this._updateContent();
    this._loadSkills();
  }

  private async _handleDeleteMarket(name: string) {
    const isDefault = DEFAULT_MARKETS.some(m => m.name === name);
    if (isDefault) {
      vscode.window.showErrorMessage('Cannot delete built-in markets.');
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Delete market "${name}"?`,
      { modal: true },
      'Delete'
    );

    if (confirm !== 'Delete') return;

    // Remove from persistence
    const currentCustom = PersistenceService.getUserMarkets();
    const filtered = currentCustom.filter(m => m.name !== name);
    PersistenceService.saveUserMarkets(filtered);

    vscode.window.showInformationMessage(`Deleted market "${name}"`);

    // Reload
    // Reload
    this._markets = [SKILL_SH_MARKET, ...getAllMarkets()];

    // Fallback to first market if current was deleted
    if (this._currentMarket?.name === name) {
      this._currentMarket = this._markets[0];
    }

    this._updateContent();
    this._loadSkills();
  }

  private _updateContent() {
    this._panel.webview.html = this._getHtmlContent();
  }

  private _getHtmlContent(): string {
    // 1. Prepare State Object
    const state = {
      markets: this._markets,
      currentMarket: this._currentMarket,
      skills: this._skills,
      installedSkills: this._installedSkills,
      loading: this._loading,
      searchText: this._searchText,
      preferredAgents: PersistenceService.getPreferredAgents(),
      allAgents: getReaders().map(r => ({ id: r.id, name: r.name })),
    };

    // 2. Resource URIs
    const styleUri = this._panel.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'marketPanel.css'));
    const scriptUri = this._panel.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'marketPanel.js'));
    const codiconUri = this._panel.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'codicon.css'));

    // 3. Load HTML Template
    const fs = require('fs');
    const path = require('path');
    const htmlPath = path.join(this._extensionUri.fsPath, 'media', 'marketPanel.html');
    let html = fs.readFileSync(htmlPath, 'utf8');

    // 4. Inject Data & Resources
    // Note: We use simple string replacement suitable for this constrained environment
    html = html.replace('<!-- CSS_URIS -->', `
        <link href="${codiconUri}" rel="stylesheet" />
        <link href="${styleUri}" rel="stylesheet" />
    `);

    html = html.replace('<!-- SCRIPT_URIS -->', `<script src="${scriptUri}"></script>`);

    html = html.replace('/* INITIAL_DATA */', `window.skillKnifeData = ${JSON.stringify(state)};`);

    // 5. Security (Content Security Policy) - Optional but good practice
    // For now, we trust local content. 

    return html;
  }
  // _escapeHtml removed as it is handled client-side now

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
