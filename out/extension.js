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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const sidebarProvider_1 = require("./views/sidebarProvider");
const skillDetailPanel_1 = require("./views/skillDetailPanel");
const marketPanel_1 = require("./views/marketPanel");
const installService_1 = require("./services/installService");
let treeDataProvider;
function activate(context) {
    // Create and register tree data provider
    treeDataProvider = new sidebarProvider_1.SkillManagerTreeDataProvider();
    const treeView = vscode.window.registerTreeDataProvider('skillManagerView', treeDataProvider);
    context.subscriptions.push(treeView);
    // Register refresh command
    const refreshCmd = vscode.commands.registerCommand('skillManager.refresh', () => {
        treeDataProvider.refresh();
        vscode.window.showInformationMessage('Skills refreshed');
    });
    // Register show detail command
    const showDetailCmd = vscode.commands.registerCommand('skillManager.showSkillDetail', (skill) => {
        skillDetailPanel_1.SkillDetailPanel.show(skill);
    });
    // Register show markets command
    const showMarketsCmd = vscode.commands.registerCommand('skillManager.showMarkets', () => {
        marketPanel_1.MarketPanel.show();
    });
    // Register delete skill command
    const deleteCmd = vscode.commands.registerCommand('skillManager.deleteSkill', async (item) => {
        const skill = item.skill;
        const confirm = await vscode.window.showWarningMessage(`Delete skill "${skill.name}" from all locations?`, { modal: true }, 'Delete');
        if (confirm === 'Delete') {
            (0, installService_1.deleteSkill)(skill);
            treeDataProvider.refresh();
            vscode.window.showInformationMessage(`Deleted ${skill.name}`);
        }
    });
    // Register filter command
    const filterCmd = vscode.commands.registerCommand('skillManager.filter', async () => {
        const input = await vscode.window.showInputBox({
            placeHolder: 'Filter skills by name or description...',
            prompt: 'Enter search text (leave empty to clear filter)',
        });
        if (input !== undefined) {
            treeDataProvider.setFilter(input);
        }
    });
    context.subscriptions.push(refreshCmd, showDetailCmd, showMarketsCmd, deleteCmd, filterCmd);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map