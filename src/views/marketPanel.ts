import * as vscode from 'vscode';
import { Market } from '../types';
import { MarketSkill, fetchMarketSkills, getAllMarkets } from '../services/marketService';
import { scanSkills } from '../services/skillScanner';
import { hasUpdateAvailable } from '../services/updateService';
import { deleteSkill } from '../services/installService';
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
  private _disposables: vscode.Disposable[] = [];
  private _markets: Market[] = [];
  private _currentMarket: Market | undefined;
  private _skills: MarketSkill[] = [];
  private _globalCache: MarketSkill[] = [];
  private _loading: boolean = false;
  private _searchText: string = '';

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;
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
    this._loadSkills();
  }

  public static show() {
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

    MarketPanel.currentPanel = new MarketPanel(panel);
  }

  private async _loadSkills() {
    if (!this._currentMarket) {
      return;
    }

    this._loading = true;
    this._updateContent();

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
      this._updateContent();
      return;
    }

    try {
      this._skills = await fetchMarketSkills(this._currentMarket);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to load skills: ${error}`);
      this._skills = [];
    }

    this._loading = false;
    this._updateContent();
  }

  private async _handleMessage(message: { command: string; marketName?: string; skillName?: string; searchText?: string; agents?: string[] }) {
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
        }
        break;

      case 'update':
        if (message.skillName) {
          await this._showUpdateDialog(message.skillName);
        }
        break;

      case 'uninstall':
        if (message.skillName) {
          await this._showUninstallDialog(message.skillName);
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
        break;

      case 'installAll':
        await this._installAllVisible();
        break;

      case 'uninstallAll':
        await this._uninstallAllVisible();
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
          this._updateContent();
        }
        break;
    }
  }

  private async _handleGlobalSearch(query: string) {
    if (!query || query.length < 2) {
      // Restore default list
      if (this._globalCache.length > 0) {
        this._skills = [...this._globalCache];
      } else {
        this._skills = [];
      }
      this._updateContent();
      return;
    }

    this._loading = true;
    this._updateContent();

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
    this._updateContent();

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

  private async _installAllVisible() {
    // 1. Identify skills to install (visible & not installed)
    const installedSkills = scanSkills();
    const installedNames = new Set(installedSkills.map((s) => s.name));

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
            // Interactive install to project
            // This will open multiple terminals if done in loop, but intended for "transform"
            runSkillsCliInteractive(['add', ...getInstallArgs(skill), ...getAgentArgs(PersistenceService.getPreferredAgents()), '-y']);
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
    this._updateContent();
  }

  private async _uninstallAllVisible() {
    // 1. Identify skills to uninstall (visible & installed)
    const installedSkills = scanSkills();
    const installedNames = new Set(installedSkills.map((s) => s.name));

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
    const targets = installedSkills.filter(s => skillsToUninstall.some(m => m.name === s.name));

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
            deleteSkill(skill);
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
    this._updateContent();
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

  private async _showUninstallDialog(skillName: string) {
    try {
      // Find installed skill to delete
      const installedSkills = scanSkills();
      const skill = installedSkills.find(s => s.name === skillName);

      if (!skill) {
        vscode.window.showErrorMessage(`Skill ${skillName} is not recognized as installed.`);
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Uninstalling ${skillName}...`,
          cancellable: false,
        },
        async () => {
          // Use internal delete service since 'remove' CLI command doesn't exist
          deleteSkill(skill);
        }
      );

      vscode.window.showInformationMessage(`Successfully uninstalled ${skillName}`);
      vscode.commands.executeCommand('skillKnife.refresh');
      this._updateContent();
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
    const installedSkills = scanSkills();
    const installedNames = new Set(installedSkills.map((s) => s.name));
    const preferred = PersistenceService.getPreferredAgents();
    const readers = getReaders().map(r => ({ id: r.id, name: r.name }));

    const marketOptions = this._markets
      .map((m) => {
        const isCustom = !DEFAULT_MARKETS.some(dm => dm.name === m.name) && m.name !== SKILL_SH_MARKET.name;
        const displayName = isCustom ? `${m.name} *` : m.name;
        const selected = m.name === this._currentMarket?.name ? 'selected' : '';
        return `<option value="${this._escapeHtml(m.name)}" ${selected}>${this._escapeHtml(displayName)}</option>`;
      })
      .join('');

    const isCustomMarket = !DEFAULT_MARKETS.some(m => m.name === this._currentMarket?.name);
    const deleteBtnStyle = isCustomMarket ? '' : 'display:none;';

    let skillsHtml: string;
    if (this._loading) {
      skillsHtml = '<div class="loading">Loading skills...</div>';
    } else if (this._skills.length === 0) {
      skillsHtml = '<div class="empty">No skills found in this market</div>';
    } else {
      // Allow client-side filtering: render ALL skills
      // For Global Search, 'this._skills' is already the result of the search query
      // For Standard Markets, we filter again in JS but we should pass all


      skillsHtml = this._skills
        .map((skill) => {
          const isInstalled = installedNames.has(skill.name);
          const hasUpdate = isInstalled && hasUpdateAvailable(skill.name, installedSkills, this._skills);

          let buttonHtml: string;
          if (isInstalled) {
            if (hasUpdate) {
              buttonHtml = `<button class="action-btn update-btn" onclick="update('${this._escapeHtml(skill.name)}')">Update</button>`;
            } else {
              buttonHtml = `<button class="action-btn uninstall-btn" onclick="uninstall('${this._escapeHtml(skill.name)}')">Uninstall</button>`;
            }
          } else {
            buttonHtml = `<button class="action-btn install-btn" onclick="install('${this._escapeHtml(skill.name)}')">Install</button>`;
          }

          const searchContent = this._escapeHtml((skill.name + ' ' + (skill.description || '')).toLowerCase());

          // Enhanced Card Design with Details Section
          const repoUrl = skill.repoPath.startsWith('http') ? skill.repoPath : `https://github.com/${skill.repoPath}`;
          // For non-global markets, description is actual description. For global, it's the install count if we use our hack.
          const installCount = skill.description && skill.description.startsWith('Installs:') ? skill.description : '';

          let metaHtml = '';
          const isGlobal = this._currentMarket?.name === SKILL_SH_MARKET.name;

          if (isGlobal) {
            metaHtml = `
                <div class="meta-stack">
                   <a href="${repoUrl}" class="meta-source" onclick="event.stopPropagation()">${this._escapeHtml(skill.repoPath)}</a>
                   <span class="meta-installs">${this._escapeHtml(installCount)}</span>
                </div>
              `;
          } else {
            metaHtml = `<div class="meta-desc">${this._escapeHtml(skill.description || '')}</div>`;
          }

          return `
          <div class="skill-card" id="card-${this._escapeHtml(skill.name)}" data-search-content="${searchContent}" onclick="toggleDetails('${this._escapeHtml(skill.name)}', event)">
            <div class="skill-header">
              <div class="header-left">
                 <span class="expand-indicator">▶</span>
                 <span class="skill-name" title="${this._escapeHtml(skill.name)}">${this._escapeHtml(skill.name)}</span>
              </div>
              <div class="header-right">
                 ${metaHtml}
                 <div onclick="event.stopPropagation()">${buttonHtml}</div>
              </div>
            </div>
            
            <div class="skill-details hidden" id="details-${this._escapeHtml(skill.name)}">
               <div class="detail-loading" ${isGlobal ? '' : 'style="display:none"'}>Loading details...</div>
               
               <div class="detail-content ${isGlobal ? 'hidden' : ''}">
                  <div class="section-title">Overview</div>
                  <div class="full-description">${isGlobal ? '' : this._escapeHtml(skill.description || '')}</div>
                  
                  <div class="install-section ${isGlobal ? '' : 'hidden'}">
                      <div class="section-title">Install Command</div>
                      <div class="install-block">
                        <code class="cmd-text"></code>
                        <button class="copy-btn" onclick="copyCmd('${this._escapeHtml(skill.name)}', event)">Copy</button>
                      </div>
                  </div>

                  <div class="links">
                    <a href="${repoUrl}" target="_blank" onclick="event.stopPropagation()">View Repository</a>
                  </div>
               </div>
            </div>
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
      /* Removed old flex styles */
      margin-bottom: 20px;
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 15px;
    }
    .market-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }
    .action-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }
    .market-controls {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    h1 {
      margin: 0;
      font-size: 1.5em;
    }
    select {
      padding: 5px 10px;
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: 3px;
      min-width: 200px;
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
    .icon-btn {
      padding: 5px;
      width: 28px;
      height: 28px;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .icon-btn.delete-btn {
      background: var(--vscode-button-secondaryBackground);
    }
    .icon-btn.delete-btn:hover {
      background: var(--vscode-errorForeground);
      color: white;
    }
    
    .search-box {
      flex-grow: 1;
      padding: 6px 10px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 3px;
    }

    .skill-card {
      background: var(--vscode-editor-inactiveSelectionBackground);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 5px;
      padding: 15px;
      margin-bottom: 10px;
    }
    .skill-card.hidden {
      display: none;
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
    .action-btn {
      padding: 4px 12px;
      font-size: 12px;
      line-height: 18px;
      min-width: 80px;
      text-align: center;
      border: 1px solid transparent;
    }
    .install-btn {
      /* Inherits primary button styles */
    }
    .update-btn, .uninstall-btn {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .update-btn:hover, .uninstall-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    .loading, .empty {
      text-align: center;
      padding: 40px;
      color: var(--vscode-descriptionForeground);
    }

    .tools-group {
      display: flex;
      gap: 8px;
    }
    
    /* New Styles */
    .skill-card {
        cursor: pointer;
        transition: border-color 0.2s;
    }
    .skill-card:hover {
        border-color: var(--vscode-focusBorder);
    }

    .header-left { display: flex; align-items: center; gap: 5px; overflow: hidden; }
    .header-right { 
        display: flex; 
        align-items: center; 
        gap: 10px;
        flex-shrink: 0; 
    }

    .expand-indicator {
      display: inline-block;
      margin-right: 6px;
      font-size: 0.8em;
      transition: transform 0.2s ease;
      color: var(--vscode-descriptionForeground);
    }
    .skill-card.expanded .expand-indicator {
      transform: rotate(90deg);
    }
    
    .meta-stack {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        font-size: 0.8em;
        line-height: 1.2;
    }
    .meta-source {
        color: var(--vscode-textLink-foreground);
        text-decoration: none;
        font-weight: 500;
    }
    .meta-source:hover { text-decoration: underline; }
    .meta-installs {
        color: var(--vscode-descriptionForeground);
        font-size: 0.9em;
    }
    .meta-desc {
        color: var(--vscode-descriptionForeground);
        font-size: 0.9em;
        max-width: 200px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .skill-details {
      margin-top: 5px;
      padding-top: 10px;
      border-top: 1px solid var(--vscode-widget-border);
      /* Removed indentation and box style for cleaner look */
      background: transparent;
      border-radius: 0;
      border: none;
      border-top: 1px solid var(--vscode-editor-lineHighlightBorder);
      margin-left: 0;
    }
    .skill-details.hidden { display: none; }
    
    .section-title {
      font-weight: bold;
      font-size: 0.8em;
      text-transform: uppercase;
      margin-bottom: 5px;
      margin-top: 10px;
      color: var(--vscode-textPreformat-foreground);
    }
    .section-title:first-child { margin-top: 0; }
    
    .full-description {
      font-size: 0.9em;
      line-height: 1.4em;
      margin-bottom: 10px;
      white-space: pre-wrap;
    }
    
    .install-block {
      display: flex;
      background: var(--vscode-textBlockQuote-background);
      border: 1px solid var(--vscode-textBlockQuote-border);
      border-radius: 3px;
      overflow: hidden;
    }
    .cmd-text {
      flex-grow: 1;
      padding: 6px;
      font-family: monospace;
      font-size: 0.9em;
      white-space: nowrap;
      overflow-x: auto;
    }
    .copy-btn {
      border-radius: 0;
      background: var(--vscode-button-secondaryBackground);
    }
    
    .links {
      margin-top: 10px;
      font-size: 0.9em;
    }
    .links a { color: var(--vscode-textLink-foreground); text-decoration: none; }
    .links a:hover { text-decoration: underline; }
    
    .detail-loading { font-style: italic; color: var(--vscode-descriptionForeground); }
    .detail-content.hidden { display: none; }
    
    /* Modal Styles */
    .modal {
        position: fixed;
        z-index: 100;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0,0,0,0.4);
        display: flex;
        justify-content: center;
        align-items: center;
    }
    .modal.hidden { display: none; }
    .modal-content {
        background-color: var(--vscode-editor-background);
        border: 1px solid var(--vscode-panel-border);
        padding: 20px;
        border-radius: 5px;
        width: 300px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    .agent-list {
        max-height: 300px;
        overflow-y: auto;
        margin: 15px 0;
        border: 1px solid var(--vscode-widget-border);
        padding: 5px;
    }
    .agent-item {
        display: flex;
        align-items: center;
        padding: 5px;
        border-bottom: 1px solid var(--vscode-widget-border);
    }
    .agent-item:last-child { border-bottom: none; }
    .agent-item input { margin-right: 10px; }
    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
    }
  </style>
</head>
<body>
  <div class="header">
    <!-- Row 1: Title and Market Selection -->
    <div class="market-bar">
      <h1>Skill Markets</h1>
      <div class="market-controls">
        <select id="marketSelect" onchange="selectMarket(this.value)">
          ${marketOptions}
        </select>
      </div>
    </div>

    <!-- Row 2: Search and Actions -->
    <div class="action-bar">
      <input type="text" class="search-box" placeholder="Search skills..." value="${this._escapeHtml(this._searchText)}" oninput="search(this.value)">
      
      <div class="tools-group">
        <button class="icon-btn" onclick="refresh()" title="Refresh Market">
          <span class="codicon codicon-refresh">↻</span>
        </button>
        <button class="icon-btn" onclick="toggleSettings()" title="Installation Settings">
          <span class="codicon codicon-gear">⚙️</span>
        </button>
      </div>
    </div>
  </div>

  <div class="skills-list">
    ${skillsHtml}
  </div>

  <!-- Settings Modal -->
  <div id="settings-modal" class="modal hidden">
    <div class="modal-content">
      <h3 style="margin-top:0">Default Install Targets</h3>
      <div style="font-size:0.9em; color:var(--vscode-descriptionForeground)">Select which agents to install skills to by default.</div>
      <div id="agent-list" class="agent-list">
        <!-- Rendered by JS -->
      </div>
      <div class="modal-actions">
         <button onclick="toggleSettings()">Cancel</button>
         <button onclick="saveSettings()" style="background:var(--vscode-button-background); color:var(--vscode-button-foreground)">Save</button>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const PREFERRED_AGENTS = ${JSON.stringify(preferred)};
    const ALL_AGENTS = ${JSON.stringify(readers)};

    function selectMarket(name) {
      vscode.postMessage({ command: 'selectMarket', marketName: name });
    }

    function install(skillName) {
      vscode.postMessage({ command: 'install', skillName: skillName });
    }

    function update(skillName) {
      vscode.postMessage({ command: 'update', skillName: skillName });
    }

    function uninstall(skillName) {
      vscode.postMessage({ command: 'uninstall', skillName: skillName });
    }

    function search(text) {
      // Client-side debounce
      if (window.searchTimeout) clearTimeout(window.searchTimeout);
      
      const isGlobal = document.getElementById('marketSelect').value === 'Global Search (skills.sh)';
      
      // Immediate local filter for non-global
      if (!isGlobal) {
        filterLocal(text);
      }

      window.searchTimeout = setTimeout(() => {
        vscode.postMessage({ command: 'search', searchText: text });
      }, 500);
    }
    
    function filterLocal(text) {
       const lowerText = text.toLowerCase();
       const cards = document.querySelectorAll('.skill-card');
       cards.forEach(card => {
        const content = card.getAttribute('data-search-content') || '';
        if (content.includes(lowerText)) {
          card.classList.remove('hidden');
        } else {
          card.classList.add('hidden');
        }
      });
    }

    function refresh() {
      vscode.postMessage({ command: 'refresh' });
    }

    function installAll() {
      vscode.postMessage({ command: 'installAll' });
    }

    function uninstallAll() {
      vscode.postMessage({ command: 'uninstallAll' });
    }
    
    // Initialize state
    document.addEventListener('DOMContentLoaded', () => {
      const input = document.querySelector('.search-box');
      if (input) {
        // Restore focus if we have a value (implies we just searched/reloaded)
        if (input.value) {
           input.focus();
           // Move cursor to end
           const len = input.value.length;
           input.setSelectionRange(len, len);
           
           // If local market, re-apply filter to be safe (visual sync)
           const isGlobal = document.getElementById('marketSelect').value === 'Global Search (skills.sh)';
           if (!isGlobal) filterLocal(input.value);
        }
      }
    });

    function deleteMarket() {
      const select = document.getElementById('marketSelect');
      vscode.postMessage({ command: 'deleteMarket', marketName: select.value });
    }
    
    // Expand/Collapse Logic
    function toggleDetails(skillName, event) {
      // Logic handled by onclick on card
      // event.stopPropagation() called on children prevents this from firing for them
      
      const details = document.getElementById('details-' + skillName);
      const card = document.getElementById('card-' + skillName);
      if (!details || !card) return;
      
      if (details.classList.contains('hidden')) {
        details.classList.remove('hidden');
        card.classList.add('expanded');
      } else {
        details.classList.add('hidden');
        card.classList.remove('expanded');
      }
    }
    
    function copyCmd(skillName, event) {
      if (event) event.stopPropagation();
      const card = document.getElementById('card-' + skillName);
      const cmd = card.querySelector('.cmd-text').innerText;
      navigator.clipboard.writeText(cmd);
    }

    // Handle updates from extension
    window.addEventListener('message', event => {
      const message = event.data;
      if (message.command === 'updateSkill') {
        const card = document.getElementById('card-' + message.skillName);
        if (!card) return;
        
        const details = card.querySelector('.skill-details');
        const loading = details.querySelector('.detail-loading');
        const content = details.querySelector('.detail-content');
        
        loading.style.display = 'none';
        content.classList.remove('hidden');
        
        if (message.description) {
           content.querySelector('.full-description').innerText = message.description;
        }
        if (message.installCmd) {
           content.querySelector('.install-section').classList.remove('hidden');
           content.querySelector('.cmd-text').innerText = message.installCmd;
        }
      }
    });

    // Settings Logic
    function toggleSettings() {
      const modal = document.getElementById('settings-modal');
      if (modal.classList.contains('hidden')) {
        renderSettings();
        modal.classList.remove('hidden');
      } else {
        modal.classList.add('hidden');
      }
    }

    function renderSettings() {
      const container = document.getElementById('agent-list');
      container.innerHTML = ALL_AGENTS.map(agent => {
        // If PREFERRED_AGENTS is empty, we consider it "All Selected" for the UI default state? 
        // Or should we show them as unchecked? 
        // Backend logic: Empty = All. 
        // So visually, if empty, we check ALL? Or check None?
        // Checking ALL is more representative of behavior.
        const isAll = PREFERRED_AGENTS.length === 0;
        const checked = isAll || PREFERRED_AGENTS.includes(agent.id) ? 'checked' : '';
        return '<div class="agent-item">' +
             '<input type="checkbox" id="chk-' + agent.id + '" value="' + agent.id + '" ' + checked + '>' +
             '<label for="chk-' + agent.id + '">' + agent.name + '</label>' +
          '</div>';
      }).join('');
    }

    function saveSettings() {
      const checkboxes = document.querySelectorAll('#agent-list input[type="checkbox"]');
      const selected = [];
      checkboxes.forEach(chk => {
        if (chk.checked) selected.push(chk.value);
      });
      
      vscode.postMessage({ command: 'saveSettings', agents: selected });
      toggleSettings();
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
