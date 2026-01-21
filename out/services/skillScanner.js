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
exports.scanSkills = scanSkills;
exports.getReaderById = getReaderById;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const readers_1 = require("../config/readers");
/**
 * Expands ~ to home directory
 */
function expandPath(p) {
    if (p.startsWith('~/') || p === '~') {
        return path.join(os.homedir(), p.slice(1));
    }
    return p;
}
/**
 * Parse SKILL.md frontmatter to extract description
 */
function parseSkillDescription(skillPath) {
    const skillMdPath = path.join(skillPath, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) {
        return undefined;
    }
    try {
        const content = fs.readFileSync(skillMdPath, 'utf-8');
        // Match YAML frontmatter
        const match = content.match(/^---\n([\s\S]*?)\n---/);
        if (match) {
            const frontmatter = match[1];
            const descMatch = frontmatter.match(/description:\s*["']?(.+?)["']?\s*$/m);
            if (descMatch) {
                return descMatch[1].trim();
            }
        }
    }
    catch {
        // Ignore read errors
    }
    return undefined;
}
/**
 * Parse .openskills.json metadata
 */
function parseSkillMetadata(skillPath) {
    const metaPath = path.join(skillPath, '.openskills.json');
    if (!fs.existsSync(metaPath)) {
        return undefined;
    }
    try {
        const content = fs.readFileSync(metaPath, 'utf-8');
        return JSON.parse(content);
    }
    catch {
        // Ignore parse errors
    }
    return undefined;
}
/**
 * Scan a directory for skills
 */
function scanDirectory(dirPath, scope, readerId) {
    const installations = [];
    const expanded = expandPath(dirPath);
    if (!fs.existsSync(expanded)) {
        return installations;
    }
    try {
        const entries = fs.readdirSync(expanded, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
                const skillPath = path.join(expanded, entry.name);
                // Check if it's a valid skill (has SKILL.md)
                if (fs.existsSync(path.join(skillPath, 'SKILL.md'))) {
                    installations.push({
                        scope,
                        readerId,
                        path: skillPath,
                    });
                }
            }
        }
    }
    catch {
        // Ignore access errors
    }
    return installations;
}
/**
 * Scan all configured locations for installed skills
 */
function scanSkills() {
    const readers = (0, readers_1.getReaders)();
    const workspaceFolders = vscode.workspace.workspaceFolders;
    // Map: skill name -> installations
    const skillMap = new Map();
    for (const reader of readers) {
        // Scan global path
        const globalInstalls = scanDirectory(reader.globalPath, 'global', reader.id);
        for (const install of globalInstalls) {
            const name = path.basename(install.path);
            const existing = skillMap.get(name) || [];
            existing.push(install);
            skillMap.set(name, existing);
        }
        // Scan project paths
        if (workspaceFolders) {
            for (const folder of workspaceFolders) {
                const projectPath = path.join(folder.uri.fsPath, reader.projectPath);
                const projectInstalls = scanDirectory(projectPath, 'project', reader.id);
                for (const install of projectInstalls) {
                    const name = path.basename(install.path);
                    const existing = skillMap.get(name) || [];
                    existing.push(install);
                    skillMap.set(name, existing);
                }
            }
        }
    }
    // Build Skill objects
    const skills = [];
    for (const [name, installations] of skillMap) {
        // Get description and metadata from first installation
        const firstPath = installations[0].path;
        skills.push({
            name,
            description: parseSkillDescription(firstPath),
            installations,
            metadata: parseSkillMetadata(firstPath),
        });
    }
    // Sort by name
    skills.sort((a, b) => a.name.localeCompare(b.name));
    return skills;
}
/**
 * Get SkillReader by id
 */
function getReaderById(id) {
    return (0, readers_1.getReaders)().find(r => r.id === id);
}
//# sourceMappingURL=skillScanner.js.map