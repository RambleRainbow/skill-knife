import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Skill } from '../types';


export class SkillDetailPanel {
  public static currentPanel: SkillDetailPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, skill: Skill) {
    this._panel = panel;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.html = this._getHtmlContent(skill);
  }

  public static show(skill: Skill) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (SkillDetailPanel.currentPanel) {
      SkillDetailPanel.currentPanel._panel.reveal(column);
      SkillDetailPanel.currentPanel._panel.webview.html =
        SkillDetailPanel.currentPanel._getHtmlContent(skill);
      SkillDetailPanel.currentPanel._panel.title = `Skill: ${skill.name}`;
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'skillDetail',
      `Skill: ${skill.name}`,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true, // Needed for interaction
        localResourceRoots: [] // Security
      }
    );

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'installProject':
            vscode.commands.executeCommand('skillKnife.installProject', { skill: skill });
            break;
          case 'uninstallProject':
            vscode.commands.executeCommand('skillKnife.uninstallProject', { skill: skill });
            break;
          case 'installGlobal':
            vscode.window.showInformationMessage('Global install not yet implemented directly from detail view.');
            break;
          case 'uninstallGlobal':
            vscode.commands.executeCommand('skillKnife.uninstallProject', { skill: skill }); // Reuse uninstall logic for now
            break;
        }
      },
      null,
      []
    );

    SkillDetailPanel.currentPanel = new SkillDetailPanel(panel, skill);
  }

  private _getHtmlContent(skill: Skill): string {
    // Read SKILL.md content
    let skillMdContent = 'No SKILL.md found';
    if (skill.installations.length > 0) {
      const skillMdPath = path.join(skill.installations[0].path, 'SKILL.md');
      if (fs.existsSync(skillMdPath)) {
        skillMdContent = fs.readFileSync(skillMdPath, 'utf-8');
        skillMdContent = skillMdContent.replace(/^---\n[\s\S]*?\n---\n/, '');
        skillMdContent = this._escapeHtml(skillMdContent);
      }
    }

    // Determine scopes
    const isProjectInstalled = skill.installations.some(i => i.scope === 'project');
    const isGlobalInstalled = skill.installations.some(i => i.scope === 'global');

    // Build source info
    let sourceHtml = '';
    if (skill.metadata?.repoUrl) {
      const escapedUrl = this._escapeHtml(skill.metadata.repoUrl);
      sourceHtml = `<p><strong>Source:</strong> <a href="${escapedUrl}">${escapedUrl}</a></p>`;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Skill: ${this._escapeHtml(skill.name)}</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
    }
    h1 {
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 10px;
    }
    a { color: var(--vscode-textLink-foreground); }
    hr {
      border: none;
      border-top: 1px solid var(--vscode-panel-border);
      margin: 20px 0;
    }
    
    /* Action Grid */
    .action-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin: 20px 0;
    }

    .scope-card {
      background: var(--vscode-textBlockQuote-background);
      border: 1px solid var(--vscode-widget-border);
      padding: 16px;
      border-radius: 6px;
    }

    .scope-title {
      font-weight: 600;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .badge {
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }

    .badge.empty {
      background: transparent;
      border: 1px solid var(--vscode-descriptionForeground);
      color: var(--vscode-descriptionForeground);
    }

    button {
      width: 100%;
      padding: 8px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-family: var(--vscode-font-family);
    }

    button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    button.destructive {
      background: var(--vscode-errorForeground); /* Red-ish fallback */
    }
    
    .content {
      white-space: pre-wrap;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <h1>${this._escapeHtml(skill.name)}</h1>
  
  ${sourceHtml}

  <div class="action-grid">
    <!-- Project Scope -->
    <div class="scope-card">
      <div class="scope-title">
        Project Scope
        <span class="badge ${isProjectInstalled ? '' : 'empty'}">${isProjectInstalled ? 'Installed' : 'Not Installed'}</span>
      </div>
      <button onclick="postMessage('${isProjectInstalled ? 'uninstallProject' : 'installProject'}', '${this._escapeHtml(skill.name)}')" class="${isProjectInstalled ? 'destructive' : ''}">
        ${isProjectInstalled ? 'Uninstall from Project' : 'Install to Project'}
      </button>
    </div>

    <!-- Global Scope -->
    <div class="scope-card">
      <div class="scope-title">
        Global Scope
        <span class="badge ${isGlobalInstalled ? '' : 'empty'}">${isGlobalInstalled ? 'Installed' : 'Not Installed'}</span>
      </div>
      <button onclick="postMessage('${isGlobalInstalled ? 'uninstallGlobal' : 'installGlobal'}', '${this._escapeHtml(skill.name)}')" class="${isGlobalInstalled ? 'destructive' : ''}">
        ${isGlobalInstalled ? 'Uninstall Globally' : 'Install Globally'}
      </button>
    </div>
  </div>

  <hr>

  <h3>Documentation</h3>
  <div class="content">${skillMdContent}</div>

  <script>
    const vscode = acquireVsCodeApi();
    function postMessage(command, skillName) {
      vscode.postMessage({ command, skillName });
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
    SkillDetailPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) {
        d.dispose();
      }
    }
  }
}
