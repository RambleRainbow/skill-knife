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
exports.SkillDetailPanel = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const skillScanner_1 = require("../services/skillScanner");
class SkillDetailPanel {
    static currentPanel;
    _panel;
    _disposables = [];
    constructor(panel, skill) {
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.html = this._getHtmlContent(skill);
    }
    static show(skill) {
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
        const panel = vscode.window.createWebviewPanel('skillDetail', `Skill: ${skill.name}`, column || vscode.ViewColumn.One, {
            enableScripts: false,
        });
        SkillDetailPanel.currentPanel = new SkillDetailPanel(panel, skill);
    }
    _getHtmlContent(skill) {
        // Read SKILL.md content
        let skillMdContent = 'No SKILL.md found';
        if (skill.installations.length > 0) {
            const skillMdPath = path.join(skill.installations[0].path, 'SKILL.md');
            if (fs.existsSync(skillMdPath)) {
                skillMdContent = fs.readFileSync(skillMdPath, 'utf-8');
                // Remove frontmatter for display
                skillMdContent = skillMdContent.replace(/^---\n[\s\S]*?\n---\n/, '');
                // Escape HTML
                skillMdContent = this._escapeHtml(skillMdContent);
            }
        }
        // Build installation locations HTML
        const installationsHtml = this._buildInstallationsHtml(skill);
        // Build source info
        let sourceHtml = '';
        if (skill.metadata?.repoUrl) {
            sourceHtml = `<p><strong>Source:</strong> ${this._escapeHtml(skill.metadata.repoUrl)}</p>`;
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
    .installations {
      background: var(--vscode-textBlockQuote-background);
      border-left: 3px solid var(--vscode-textBlockQuote-border);
      padding: 10px 15px;
      margin: 15px 0;
    }
    .installation-item {
      margin: 5px 0;
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
    }
    .scope-label {
      font-weight: bold;
      color: var(--vscode-textLink-foreground);
    }
    .content {
      white-space: pre-wrap;
      font-family: var(--vscode-editor-font-family);
      font-size: 13px;
      line-height: 1.5;
    }
    hr {
      border: none;
      border-top: 1px solid var(--vscode-panel-border);
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <h1>${this._escapeHtml(skill.name)}</h1>

  <div class="installations">
    <strong>Installed at:</strong>
    ${installationsHtml}
  </div>

  ${sourceHtml}

  <hr>

  <div class="content">${skillMdContent}</div>
</body>
</html>`;
    }
    _buildInstallationsHtml(skill) {
        const projectInstalls = [];
        const globalInstalls = [];
        for (const install of skill.installations) {
            const reader = (0, skillScanner_1.getReaderById)(install.readerId);
            const readerName = reader?.name || install.readerId;
            if (install.scope === 'project') {
                projectInstalls.push({ reader: readerName, path: install.path });
            }
            else {
                globalInstalls.push({ reader: readerName, path: install.path });
            }
        }
        let html = '';
        if (projectInstalls.length > 0) {
            html += `<div class="installation-item"><span class="scope-label">Project:</span></div>`;
            for (const inst of projectInstalls) {
                html += `<div class="installation-item">&nbsp;&nbsp;└─ ${this._escapeHtml(inst.reader)}: ${this._escapeHtml(inst.path)}</div>`;
            }
        }
        if (globalInstalls.length > 0) {
            html += `<div class="installation-item"><span class="scope-label">Global:</span></div>`;
            for (const inst of globalInstalls) {
                html += `<div class="installation-item">&nbsp;&nbsp;└─ ${this._escapeHtml(inst.reader)}: ${this._escapeHtml(inst.path)}</div>`;
            }
        }
        return html;
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
exports.SkillDetailPanel = SkillDetailPanel;
//# sourceMappingURL=skillDetailPanel.js.map