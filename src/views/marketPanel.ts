import * as vscode from 'vscode';
import { Market } from '../types';
import { MarketSkill, fetchMarketSkills, getAllMarkets } from '../services/marketService';
import { scanSkills } from '../services/skillScanner';
import { hasUpdateAvailable } from '../services/updateService';
import { runOpenSkills, getInstallSource } from '../services/cliService';
import { PersistenceService } from '../services/persistenceService';
import { DEFAULT_MARKETS } from '../config/defaults';
import { SkillShService } from '../services/skillShService';

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
  private _loading: boolean = false;
  private _searchText: string = '';

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;
    this._markets = [SKILL_SH_MARKET, ...getAllMarkets()];
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
      // For global search, we don't load anything initially
      // We wait for the user to search
      this._skills = [];
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
    }
  }

  private async _handleGlobalSearch(query: string) {
    if (!query || query.length < 2) {
      this._skills = [];
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
        description: `Source: ${r.topSource} | Installs: ${r.installs}`, // Encode metadata in description
        market: this._currentMarket!,
        repoPath: r.topSource, // e.g. "sickn33/antigravity-awesome-skills"
        subpath: r.name, // BEST GUESS: assume skill name matches directory name
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

    if (skillsToUninstall.length === 0) {
      vscode.window.showInformationMessage('No installed skills found in current view.');
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Uninstall ${skillsToUninstall.length} skills from this market?`,
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
        const total = skillsToUninstall.length;
        const errors: string[] = [];

        for (const skill of skillsToUninstall) {
          progress.report({ message: `Uninstalling ${skill.name} (${++count}/${total})...` });
          try {
            await runOpenSkills(['remove', skill.name]);
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

          return `
          <div class="skill-card" id="card-${this._escapeHtml(skill.name)}" data-search-content="${searchContent}">
            <div class="skill-header">
              <div class="header-left">
                 <button class="expand-btn" onclick="toggleDetails('${this._escapeHtml(skill.name)}')">▶</button>
                 <span class="skill-name" title="${this._escapeHtml(skill.name)}">${this._escapeHtml(skill.name)}</span>
              </div>
              <div class="header-right">
                 ${buttonHtml}
              </div>
            </div>
            <div class="skill-meta">
               ${this._escapeHtml(skill.description || '')}
            </div>
            
            <div class="skill-details hidden" id="details-${this._escapeHtml(skill.name)}">
               <div class="detail-loading">Loading details...</div>
               <div class="detail-content hidden">
                  <div class="section-title">Description</div>
                  <div class="full-description"></div>
                  
                  <div class="section-title">Install Command</div>
                  <div class="install-block">
                    <code class="cmd-text"></code>
                    <button class="copy-btn" onclick="copyCmd('${this._escapeHtml(skill.name)}')">Copy</button>
                  </div>
                  
                  <div class="links">
                    <a href="${repoUrl}" target="_blank">View Repository</a>
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
    .header-left { display: flex; align-items: center; gap: 5px; overflow: hidden; }
    .header-right { flex-shrink: 0; }
    
    .expand-btn {
      background: none;
      color: var(--vscode-foreground);
      padding: 0 4px;
      min-width: 20px;
      font-size: 10px;
    }
    .expand-btn:hover { background: var(--vscode-toolbar-hoverBackground); }
    .expand-btn.expanded { transform: rotate(90deg); }
    
    .skill-meta {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
      margin-left: 25px; /* Indent to align with text */
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .skill-details {
      margin-top: 10px;
      padding: 10px;
      background: var(--vscode-editor-background);
      border-radius: 4px;
      border: 1px solid var(--vscode-editorGroup-border);
      margin-left: 25px;
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
        <button class="icon-btn" title="Add Custom Market" onclick="addMarket()">
          <span class="codicon codicon-add">+</span>
        </button>
        <button class="icon-btn delete-btn" title="Delete Market" style="${deleteBtnStyle}" onclick="deleteMarket()">
          <span class="codicon codicon-trash">🗑️</span>
        </button>
      </div>
    </div>

    <!-- Row 2: Search and Actions -->
    <div class="action-bar">
      <input type="text" class="search-box" placeholder="Search skills..." value="${this._escapeHtml(this._searchText)}" oninput="search(this.value)">
      
      <div class="tools-group">
        <button onclick="installAll()" title="Install all visible skills">Install All</button>
        <button onclick="uninstallAll()" title="Uninstall all visible skills">Uninstall All</button>
        <button class="icon-btn" onclick="refresh()" title="Refresh Market">
          <span class="codicon codicon-refresh">↻</span>
        </button>
      </div>
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
    function toggleDetails(skillName) {
      const details = document.getElementById('details-' + skillName);
      const btn = document.querySelector('#card-' + skillName + ' .expand-btn');
      
      if (details.classList.contains('hidden')) {
        details.classList.remove('hidden');
        btn.classList.add('expanded');
        btn.innerText = '▼';
      } else {
        details.classList.add('hidden');
        btn.classList.remove('expanded');
        btn.innerText = '▶';
      }
    }
    
    function copyCmd(skillName) {
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
           content.querySelector('.cmd-text').innerText = message.installCmd;
        }
      }
    });

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
