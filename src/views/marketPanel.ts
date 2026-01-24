import * as vscode from 'vscode';
import { Market } from '../types';
import { MarketSkill, fetchMarketSkills, getAllMarkets } from '../services/marketService';
import { scanSkills } from '../services/skillScanner';
import { hasUpdateAvailable } from '../services/updateService';
import { runOpenSkills, getInstallSource } from '../services/cliService';
import { PersistenceService } from '../services/persistenceService';
import { DEFAULT_MARKETS } from '../config/defaults';

export class MarketPanel {
  public static currentPanel: MarketPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _markets: Market[] = [];
  private _currentMarket: Market | undefined;
  private _skills: MarketSkill[] = [];
  private _loading: boolean = false;
  private _searchText: string = '';

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;
    this._markets = getAllMarkets();
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

    try {
      this._skills = await fetchMarketSkills(this._currentMarket);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to load skills: ${error}`);
      this._skills = [];
    }

    this._loading = false;
    this._updateContent();
  }

  private async _handleMessage(message: { command: string; marketName?: string; skillName?: string; searchText?: string }) {
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
        // No updateContent() to avoid focus loss
        break;

      case 'refresh':
        await this._loadSkills();
        break;

      case 'installAll':
        await this._installAllVisible();
        break;

      case 'addMarket':
        await this._handleAddMarket();
        break;

      case 'deleteMarket':
        if (message.marketName) {
          await this._handleDeleteMarket(message.marketName);
        }
        break;
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
            const source = getInstallSource(skill);
            // Universal Install
            await runOpenSkills(['install', source, '--universal']);
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
          vscode.window.showInformationMessage(`Successfully installed ${total} skills.`);
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
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Installing ${skill.name}...`,
          cancellable: false,
        },
        async () => {
          const source = getInstallSource(skill);
          // Universal Install
          await runOpenSkills(['install', source, '--universal']);
        }
      );

      vscode.window.showInformationMessage(`Successfully installed ${skill.name} (Universal)`);

      // Refresh the sidebar
      vscode.commands.executeCommand('skillKnife.refresh');

      // Update the market panel to show installed status
      this._updateContent();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to install ${skill.name}: ${error}`);
    }
  }

  private async _showUpdateDialog(skillName: string) {
    const skill = this._skills.find((s) => s.name === skillName);
    if (!skill) {
      return;
    }

    // Direct Update (Re-install Project + Universal)
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Updating ${skill.name}...`,
          cancellable: false,
        },
        async () => {
          const source = getInstallSource(skill);
          // Universal Install
          await runOpenSkills(['install', source, '--universal']);
        }
      );

      vscode.window.showInformationMessage(`Successfully updated ${skill.name}`);

      // Refresh the sidebar
      vscode.commands.executeCommand('skillKnife.refresh');

      // Update the market panel
      this._updateContent();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to update ${skill.name}: ${error}`);
    }
  }

  private async _showUninstallDialog(skillName: string) {
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Uninstalling ${skillName}...`,
          cancellable: false,
        },
        async () => {
          // Attempt to remove
          try { await runOpenSkills(['remove', skillName]); } catch (e) { }
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
    this._markets = getAllMarkets(); // Reload from source

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
    this._markets = getAllMarkets();

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

    const marketOptions = this._markets
      .map((m) => {
        const isCustom = !DEFAULT_MARKETS.some(dm => dm.name === m.name);
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

          return `
          <div class="skill-card" data-search-content="${searchContent}">
            <div class="skill-header">
              <span class="skill-name">${this._escapeHtml(skill.name)}</span>
              ${buttonHtml}
            </div>
            <div class="skill-description">${this._escapeHtml(skill.description || 'No description')}</div>
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
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 10px;
    }
    h1 {
      margin: 0;
      font-size: 1.5em;
    }
    .controls {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    select {
      padding: 5px 10px;
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: 3px;
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
    .search-box {
      padding: 5px 10px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 3px;
      width: 200px;
    }
    .market-controls {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .icon-btn {
      padding: 5px;
      min-width: 30px;
    }
    .icon-btn.delete-btn {
      background: var(--vscode-button-secondaryBackground);
    }
    .icon-btn.delete-btn:hover {
      background: var(--vscode-errorForeground);
      color: white;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Skill Markets</h1>
    <div class="controls">
      <input type="text" class="search-box" placeholder="Search skills..." value="${this._escapeHtml(this._searchText)}" oninput="search(this.value)">
      <div class="market-controls">
        <select id="marketSelect" onchange="selectMarket(this.value)">
          ${marketOptions}
        </select>
        <button class="icon-btn" title="Add Market" onclick="addMarket()">
          <span class="codicon codicon-add">+</span>
        </button>
        <button class="icon-btn delete-btn" title="Delete Market" style="${deleteBtnStyle}" onclick="deleteMarket()">
          <span class="codicon codicon-trash">🗑️</span>
        </button>
      </div>
      <button onclick="installAll()">Install All</button>
      <button onclick="refresh()">Refresh</button>
    </div>
  </div>

  <div class="skills-list">
    ${skillsHtml}
  </div>

  <script>
    const vscode = acquireVsCodeApi();

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
      const lowerText = text.toLowerCase();
      const cards = document.querySelectorAll('.skill-card');
      let visibleCount = 0;

      cards.forEach(card => {
        const content = card.getAttribute('data-search-content') || '';
        if (content.includes(lowerText)) {
          card.classList.remove('hidden');
          visibleCount++;
        } else {
          card.classList.add('hidden');
        }
      });

      vscode.postMessage({ command: 'search', searchText: text });
    }

    function refresh() {
      vscode.postMessage({ command: 'refresh' });
    }

    function installAll() {
      vscode.postMessage({ command: 'installAll' });
    }
    
    // Initialize search state
    // document.addEventListener('DOMContentLoaded', () => {
    //   const input = document.querySelector('.search-box');
    //   if (input && input.value) {
    //     search(input.value);
    //   }
    // });
    function addMarket() {
      vscode.postMessage({ command: 'addMarket' });
    }

    function deleteMarket() {
      const select = document.getElementById('marketSelect');
      vscode.postMessage({ command: 'deleteMarket', marketName: select.value });
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
