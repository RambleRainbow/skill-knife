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
exports.SkillManagerTreeDataProvider = exports.SkillTreeItem = void 0;
const vscode = __importStar(require("vscode"));
const skillScanner_1 = require("../services/skillScanner");
/**
 * Tree item representing a skill in the sidebar
 */
class SkillTreeItem extends vscode.TreeItem {
    skill;
    collapsibleState;
    constructor(skill, collapsibleState) {
        super(skill.name, collapsibleState);
        this.skill = skill;
        this.collapsibleState = collapsibleState;
        this.tooltip = skill.description || skill.name;
        this.description = this.buildLocationTags();
        this.iconPath = new vscode.ThemeIcon('file-code');
        this.contextValue = 'skill';
        // Command to show detail on click
        this.command = {
            command: 'skillManager.showSkillDetail',
            title: 'Show Skill Detail',
            arguments: [skill],
        };
    }
    /**
     * Build location tags like "[Proj·CC,CX][Glob·GM]"
     */
    buildLocationTags() {
        const projReaders = [];
        const globReaders = [];
        for (const install of this.skill.installations) {
            const reader = (0, skillScanner_1.getReaderById)(install.readerId);
            const shortName = reader?.shortName || install.readerId;
            if (install.scope === 'project') {
                if (!projReaders.includes(shortName)) {
                    projReaders.push(shortName);
                }
            }
            else {
                if (!globReaders.includes(shortName)) {
                    globReaders.push(shortName);
                }
            }
        }
        const tags = [];
        if (projReaders.length > 0) {
            tags.push(`[Proj·${projReaders.join(',')}]`);
        }
        if (globReaders.length > 0) {
            tags.push(`[Glob·${globReaders.join(',')}]`);
        }
        return tags.join('');
    }
}
exports.SkillTreeItem = SkillTreeItem;
/**
 * TreeDataProvider for the sidebar
 */
class SkillManagerTreeDataProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    skills = [];
    filterText = '';
    constructor() {
        this.refresh();
    }
    setFilter(text) {
        this.filterText = text.toLowerCase();
        this._onDidChangeTreeData.fire(undefined);
    }
    refresh() {
        this.skills = (0, skillScanner_1.scanSkills)();
        this._onDidChangeTreeData.fire(undefined);
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element) {
            // No children for individual items
            return [];
        }
        // Root level: skills + markets
        const items = [];
        // Filter skills
        const filteredSkills = this.filterText
            ? this.skills.filter((s) => s.name.toLowerCase().includes(this.filterText) ||
                (s.description && s.description.toLowerCase().includes(this.filterText)))
            : this.skills;
        for (const skill of filteredSkills) {
            items.push(new SkillTreeItem(skill, vscode.TreeItemCollapsibleState.None));
        }
        return items;
    }
    getSkills() {
        return this.skills;
    }
}
exports.SkillManagerTreeDataProvider = SkillManagerTreeDataProvider;
//# sourceMappingURL=sidebarProvider.js.map