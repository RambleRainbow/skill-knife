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
exports.DEFAULT_READERS = void 0;
exports.getReaders = getReaders;
const vscode = __importStar(require("vscode"));
/**
 * Built-in default SkillReader configurations
 */
exports.DEFAULT_READERS = [
    {
        id: 'claude-code',
        name: 'Claude Code',
        shortName: 'CC',
        globalPath: '~/.claude/skills',
        projectPath: '.claude/skills',
    },
    {
        id: 'codex',
        name: 'Codex',
        shortName: 'CX',
        globalPath: '~/.codex/skills',
        projectPath: '.codex/skills',
    },
    {
        id: 'gemini-cli',
        name: 'Gemini CLI',
        shortName: 'GM',
        globalPath: '~/.gemini/skills',
        projectPath: '.gemini/skills',
    },
    {
        id: 'antigravity',
        name: 'Antigravity',
        shortName: 'AG',
        globalPath: '~/.agent/skills',
        projectPath: '.agent/skills',
    },
];
/**
 * Get merged readers from default + user configuration
 */
function getReaders() {
    const config = vscode.workspace.getConfiguration('skillManager');
    const userReaders = config.get('readers') || [];
    // Merge: user config overrides defaults by id
    const readerMap = new Map();
    for (const reader of exports.DEFAULT_READERS) {
        readerMap.set(reader.id, reader);
    }
    for (const reader of userReaders) {
        readerMap.set(reader.id, { ...readerMap.get(reader.id), ...reader });
    }
    return Array.from(readerMap.values());
}
//# sourceMappingURL=readers.js.map