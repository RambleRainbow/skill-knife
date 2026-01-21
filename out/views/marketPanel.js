"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketPanel = void 0;
const vscode = __importStar(require("vscode"));
const marketService_1 = require("../services/marketService");
const installService_1 = require("../services/installService");
const skillScanner_1 = require("../services/skillScanner");
const updateService_1 = require("../services/updateService");
class MarketPanel {
    static currentPanel;
    _panel;
    _disposables = [];
    _markets = [];
    _currentMarket;
    _skills = [];
    _loading = false;
    _searchText = '';
    constructor(panel) {
        this._panel = panel;
        this._markets = (0, marketService_1.getAllMarkets)();
        this._currentMarket = this._markets[0];
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage((message) => this._handleMessage(message), null, this._disposables);
        this._updateContent();
        this._loadSkills();
    }
    static show() {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        if (MarketPanel.currentPanel) {
            MarketPanel.currentPanel._panel.reveal(column);
            return;
        }
        const panel = vscode.window.createWebviewPanel('skillMarket', 'Skill Markets', column || vscode.ViewColumn.One, {
            enableScripts: true,
        });
        MarketPanel.currentPanel = new MarketPanel(panel);
    }
    async _loadSkills() {
        if (!this._currentMarket) {
            return;
        }
        this._loading = true;
        this._updateContent();
        try {
            this._skills = await (0, marketService_1.fetchMarketSkills)(this._currentMarket);
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to load skills: ${error}`);
            this._skills = [];
        }
        this._loading = false;
        this._updateContent();
    }
    async _handleMessage(message) {
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
            case 'search':
                this._searchText = message.searchText?.toLowerCase() || '';
                this._updateContent();
                break;
            case 'refresh':
                await this._loadSkills();
                break;
        }
    }
    async _showInstallDialog(skillName) {
        const skill = this._skills.find((s) => s.name === skillName);
        if (!skill) {
            return;
        }
        // Step 1: Select scope
        const scopeChoice = await vscode.window.showQuickPick([
            { label: 'Project', description: 'Install to current project', scope: 'project' },
            { label: 'Global', description: 'Install globally', scope: 'global' },
        ], { placeHolder: 'Select installation scope' });
        if (!scopeChoice) {
            return;
        }
        // Step 2: Select readers
        const readers = (0, installService_1.getAvailableReaders)();
        const readerChoices = readers.map((r) => ({
            label: r.name,
            picked: true,
            reader: r,
        }));
        const selectedReaders = await vscode.window.showQuickPick(readerChoices, {
            placeHolder: 'Select target readers',
            canPickMany: true,
        });
        if (!selectedReaders || selectedReaders.length === 0) {
            return;
        }
        // Install
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Installing ${skill.name}...`,
                cancellable: false,
            }, async () => {
                await (0, installService_1.installSkill)({
                    skill,
                    scope: scopeChoice.scope,
                    readers: selectedReaders.map((r) => r.reader),
                });
            });
            vscode.window.showInformationMessage(`Successfully installed ${skill.name}`);
            // Refresh the sidebar
            vscode.commands.executeCommand('skillManager.refresh');
            // Update the market panel to show installed status
            this._updateContent();
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to install ${skill.name}: ${error}`);
        }
    }
    async _showUpdateDialog(skillName) {
        const skill = this._skills.find((s) => s.name === skillName);
        if (!skill) {
            return;
        }
        // Step 1: Select scope
        const scopeChoice = await vscode.window.showQuickPick([
            { label: 'Project', description: 'Update in current project', scope: 'project' },
            { label: 'Global', description: 'Update globally', scope: 'global' },
        ], { placeHolder: 'Select update scope' });
        if (!scopeChoice) {
            return;
        }
        // Step 2: Select readers
        const readers = (0, installService_1.getAvailableReaders)();
        const readerChoices = readers.map((r) => ({
            label: r.name,
            picked: true,
            reader: r,
        }));
        const selectedReaders = await vscode.window.showQuickPick(readerChoices, {
            placeHolder: 'Select target readers',
            canPickMany: true,
        });
        if (!selectedReaders || selectedReaders.length === 0) {
            return;
        }
        // Update (reinstall)
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Updating ${skill.name}...`,
                cancellable: false,
            }, async () => {
                await (0, installService_1.installSkill)({
                    skill,
                    scope: scopeChoice.scope,
                    readers: selectedReaders.map((r) => r.reader),
                });
            });
            vscode.window.showInformationMessage(`Successfully updated ${skill.name}`);
            // Refresh the sidebar
            vscode.commands.executeCommand('skillManager.refresh');
            // Update the market panel
            this._updateContent();
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to update ${skill.name}: ${error}`);
        }
    }
    _updateContent() {
        this._panel.webview.html = this._getHtmlContent();
    }
    _getHtmlContent() {
        const installedSkills = (0, skillScanner_1.scanSkills)();
        const installedNames = new Set(installedSkills.map((s) => s.name));
        const marketOptions = this._markets
            .map((m) => {
            const selected = m.name === this._currentMarket?.name ? 'selected' : '';
            return `<option value="${this._escapeHtml(m.name)}" ${selected}>${this._escapeHtml(m.name)}</option>`;
        })
            .join('');
        let skillsHtml;
        if (this._loading) {
            skillsHtml = '<div class="loading">Loading skills...</div>';
        }
        else if (this._skills.length === 0) {
            skillsHtml = '<div class="empty">No skills found in this market</div>';
        }
        else {
            // Filter skills by search text
            const filteredSkills = this._searchText
                ? this._skills.filter((s) => s.name.toLowerCase().includes(this._searchText) ||
                    (s.description && s.description.toLowerCase().includes(this._searchText)))
                : this._skills;
            if (filteredSkills.length === 0) {
                skillsHtml = '<div class="empty">No skills match your search</div>';
            }
            else {
                skillsHtml = filteredSkills
                    .map((skill) => {
                    const isInstalled = installedNames.has(skill.name);
                    const hasUpdate = isInstalled && (0, updateService_1.hasUpdateAvailable)(skill.name, installedSkills, this._skills);
                    let buttonHtml;
                    if (isInstalled) {
                        if (hasUpdate) {
                            buttonHtml = `<button class="update-btn" onclick="update('${this._escapeHtml(skill.name)}')">Update</button>`;
                        }
                        else {
                            buttonHtml = '<span class="installed-badge">Installed</span>';
                        }
                    }
                    else {
                        buttonHtml = `<button class="install-btn" onclick="install('${this._escapeHtml(skill.name)}')">Install</button>`;
                    }
                    return `
            <div class="skill-card">
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
    .install-btn {
      padding: 3px 12px;
      font-size: 0.85em;
    }
    .update-btn {
      padding: 3px 12px;
      font-size: 0.85em;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .update-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    .installed-badge {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 3px 8px;
      border-radius: 3px;
      font-size: 0.8em;
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
  </style>
</head>
<body>
  <div class="header">
    <h1>Skill Markets</h1>
    <div class="controls">
      <input type="text" class="search-box" placeholder="Search skills..." oninput="search(this.value)">
      <select id="marketSelect" onchange="selectMarket(this.value)">
        ${marketOptions}
      </select>
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

    function search(text) {
      vscode.postMessage({ command: 'search', searchText: text });
    }

    function refresh() {
      vscode.postMessage({ command: 'refresh' });
    }
  </script>
</body>
</html>`;
    }
    _escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    dispose() {
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
exports.MarketPanel = MarketPanel;
//# sourceMappingURL=marketPanel.js.map