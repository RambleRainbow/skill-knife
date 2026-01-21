import * as vscode from 'vscode';
import { Market } from '../types';
import { MarketSkill, fetchMarketSkills, getAllMarkets } from '../services/marketService';
import { installSkill, getAvailableReaders } from '../services/installService';
import { scanSkills } from '../services/skillScanner';

export class MarketPanel {
  public static currentPanel: MarketPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _markets: Market[] = [];
  private _currentMarket: Market | undefined;
  private _skills: MarketSkill[] = [];
  private _loading: boolean = false;

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

  private async _handleMessage(message: { command: string; marketName?: string; skillName?: string }) {
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

      case 'refresh':
        await this._loadSkills();
        break;
    }
  }

  private async _showInstallDialog(skillName: string) {
    const skill = this._skills.find((s) => s.name === skillName);
    if (!skill) {
      return;
    }

    // Step 1: Select scope
    const scopeChoice = await vscode.window.showQuickPick(
      [
        { label: 'Project', description: 'Install to current project', scope: 'project' as const },
        { label: 'Global', description: 'Install globally', scope: 'global' as const },
      ],
      { placeHolder: 'Select installation scope' }
    );

    if (!scopeChoice) {
      return;
    }

    // Step 2: Select readers
    const readers = getAvailableReaders();
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
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Installing ${skill.name}...`,
          cancellable: false,
        },
        async () => {
          await installSkill({
            skill,
            scope: scopeChoice.scope,
            readers: selectedReaders.map((r) => r.reader),
          });
        }
      );

      vscode.window.showInformationMessage(`Successfully installed ${skill.name}`);

      // Refresh the sidebar
      vscode.commands.executeCommand('skillManager.refresh');

      // Update the market panel to show installed status
      this._updateContent();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to install ${skill.name}: ${error}`);
    }
  }

  private _updateContent() {
    this._panel.webview.html = this._getHtmlContent();
  }

  private _getHtmlContent(): string {
    const installedSkills = scanSkills();
    const installedNames = new Set(installedSkills.map((s) => s.name));

    const marketOptions = this._markets
      .map((m) => {
        const selected = m.name === this._currentMarket?.name ? 'selected' : '';
        return `<option value="${this._escapeHtml(m.name)}" ${selected}>${this._escapeHtml(m.name)}</option>`;
      })
      .join('');

    let skillsHtml: string;
    if (this._loading) {
      skillsHtml = '<div class="loading">Loading skills...</div>';
    } else if (this._skills.length === 0) {
      skillsHtml = '<div class="empty">No skills found in this market</div>';
    } else {
      skillsHtml = this._skills
        .map((skill) => {
          const isInstalled = installedNames.has(skill.name);
          const buttonHtml = isInstalled
            ? '<span class="installed-badge">Installed</span>'
            : `<button class="install-btn" onclick="install('${this._escapeHtml(skill.name)}')">Install</button>`;

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
  </style>
</head>
<body>
  <div class="header">
    <h1>Skill Markets</h1>
    <div class="controls">
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

    function refresh() {
      vscode.postMessage({ command: 'refresh' });
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
