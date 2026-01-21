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
exports.getCacheDir = getCacheDir;
exports.fetchMarketSkills = fetchMarketSkills;
exports.getAllMarkets = getAllMarkets;
const cp = __importStar(require("child_process"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const markets_1 = require("../config/markets");
/**
 * Execute git command
 */
async function execGit(args, cwd) {
    return new Promise((resolve, reject) => {
        const child = cp.spawn('git', args, { cwd, shell: true });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        child.on('close', (code) => {
            if (code === 0) {
                resolve(stdout);
            }
            else {
                reject(new Error(stderr || `git exited with code ${code}`));
            }
        });
        child.on('error', (err) => {
            reject(err);
        });
    });
}
/**
 * Find all skill directories in a repo
 */
function findSkillDirectories(repoDir) {
    const skills = [];
    // Look for common skill directory patterns
    const searchDirs = [
        path.join(repoDir, 'skills'),
        repoDir,
    ];
    for (const searchDir of searchDirs) {
        if (!fs.existsSync(searchDir)) {
            continue;
        }
        try {
            const entries = fs.readdirSync(searchDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory() && !entry.name.startsWith('.')) {
                    const skillPath = path.join(searchDir, entry.name);
                    if (fs.existsSync(path.join(skillPath, 'SKILL.md'))) {
                        skills.push(skillPath);
                    }
                }
            }
        }
        catch {
            // Ignore access errors
        }
    }
    return skills;
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
 * Get cache directory for market repos
 */
function getCacheDir() {
    return path.join(os.homedir(), '.skill-manager', 'cache');
}
/**
 * Fetch skills list from a git repository by cloning/updating locally
 */
async function fetchMarketSkills(market) {
    const skills = [];
    try {
        // Clone or update the repo to a temp location
        const cacheDir = getCacheDir();
        const repoName = market.git.replace(/[\/\\:]/g, '_');
        const repoDir = path.join(cacheDir, repoName);
        // Ensure cache directory exists
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }
        // Clone or pull the repository
        if (fs.existsSync(repoDir)) {
            // Pull latest changes
            await execGit(['pull'], repoDir);
        }
        else {
            // Clone the repository
            const gitUrl = market.git.includes('://')
                ? market.git
                : `https://github.com/${market.git}.git`;
            await execGit(['clone', '--depth', '1', gitUrl, repoDir], cacheDir);
        }
        // Scan for skills in the repo
        const skillDirs = findSkillDirectories(repoDir);
        for (const skillDir of skillDirs) {
            const skillName = path.basename(skillDir);
            const description = parseSkillDescription(skillDir);
            const subpath = path.relative(repoDir, skillDir);
            skills.push({
                name: skillName,
                description,
                market,
                repoPath: market.git,
                subpath,
            });
        }
    }
    catch (error) {
        console.error(`Failed to fetch skills from ${market.name}:`, error);
        throw error;
    }
    return skills;
}
/**
 * Get all configured markets
 */
function getAllMarkets() {
    return (0, markets_1.getMarkets)();
}
//# sourceMappingURL=marketService.js.map