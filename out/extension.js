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
let treeDataProvider;
function activate(context) {
    // Create and register tree data provider
    treeDataProvider = new sidebarProvider_1.SkillManagerTreeDataProvider();
    vscode.window.registerTreeDataProvider('skillManagerView', treeDataProvider);
    // Register refresh command
    const refreshCmd = vscode.commands.registerCommand('skillManager.refresh', () => {
        treeDataProvider.refresh();
        vscode.window.showInformationMessage('Skills refreshed');
    });
    // Register show detail command
    const showDetailCmd = vscode.commands.registerCommand('skillManager.showSkillDetail', (skill) => {
        skillDetailPanel_1.SkillDetailPanel.show(skill);
    });
    // Register show markets command (placeholder for now)
    const showMarketsCmd = vscode.commands.registerCommand('skillManager.showMarkets', () => {
        vscode.window.showInformationMessage('Markets view coming in Milestone 2');
    });
    context.subscriptions.push(refreshCmd, showDetailCmd, showMarketsCmd);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map