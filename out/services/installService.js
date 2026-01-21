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
exports.installSkill = installSkill;
exports.getAvailableReaders = getAvailableReaders;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const readers_1 = require("../config/readers");
const marketService_1 = require("./marketService");
/**
 * Expand ~ to home directory
 */
function expandPath(p) {
    if (p.startsWith('~/') || p === '~') {
        return path.join(os.homedir(), p.slice(1));
    }
    return p;
}
/**
 * Copy directory recursively
 */
function copyDir(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        }
        else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}
/**
 * Install a skill to specified readers
 */
async function installSkill(options) {
    const { skill, scope, readers } = options;
    // Get the cached skill directory
    const cacheDir = (0, marketService_1.getCacheDir)();
    const repoName = skill.repoPath.replace(/[\/\\:]/g, '_');
    const repoDir = path.join(cacheDir, repoName);
    const skillSourceDir = path.join(repoDir, skill.subpath);
    if (!fs.existsSync(skillSourceDir)) {
        throw new Error(`Skill source not found: ${skillSourceDir}`);
    }
    // Get workspace folder for project scope
    let projectRoot;
    if (scope === 'project') {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error('No workspace folder open for project installation');
        }
        projectRoot = workspaceFolders[0].uri.fsPath;
    }
    // Install to each selected reader
    for (const reader of readers) {
        let targetDir;
        if (scope === 'global') {
            targetDir = path.join(expandPath(reader.globalPath), skill.name);
        }
        else {
            if (!projectRoot) {
                throw new Error('Project root not available');
            }
            targetDir = path.join(projectRoot, reader.projectPath, skill.name);
        }
        // Copy skill files
        copyDir(skillSourceDir, targetDir);
        // Write .openskills.json metadata
        const metadata = {
            source: `https://github.com/${skill.repoPath}`,
            sourceType: 'git',
            repoUrl: `https://github.com/${skill.repoPath}`,
            subpath: skill.subpath,
            installedAt: new Date().toISOString(),
        };
        fs.writeFileSync(path.join(targetDir, '.openskills.json'), JSON.stringify(metadata, null, 2));
    }
}
/**
 * Get all available readers
 */
function getAvailableReaders() {
    return (0, readers_1.getReaders)();
}
//# sourceMappingURL=installService.js.map