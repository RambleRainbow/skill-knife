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
exports.checkForUpdates = checkForUpdates;
exports.hasUpdateAvailable = hasUpdateAvailable;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const marketService_1 = require("./marketService");
const skillScanner_1 = require("./skillScanner");
/**
 * Get the commit hash from installed skill metadata
 */
function getInstalledCommit(skill) {
    if (skill.installations.length === 0) {
        return undefined;
    }
    const metaPath = path.join(skill.installations[0].path, '.openskills.json');
    if (!fs.existsSync(metaPath)) {
        return undefined;
    }
    try {
        const content = fs.readFileSync(metaPath, 'utf-8');
        const meta = JSON.parse(content);
        return meta.commitHash;
    }
    catch {
        return undefined;
    }
}
/**
 * Check if a skill has updates available
 */
async function checkForUpdates() {
    const updates = [];
    const installedSkills = (0, skillScanner_1.scanSkills)();
    const markets = (0, marketService_1.getAllMarkets)();
    // Fetch all market skills
    const allMarketSkills = [];
    for (const market of markets) {
        try {
            const skills = await (0, marketService_1.fetchMarketSkills)(market);
            allMarketSkills.push(...skills);
        }
        catch {
            // Skip failed markets
        }
    }
    // Compare installed skills with market versions
    for (const skill of installedSkills) {
        // Find matching market skill
        const marketSkill = allMarketSkills.find((ms) => ms.name === skill.name);
        if (!marketSkill) {
            continue; // Not from a market
        }
        // Get installed commit from .openskills.json
        const installedCommit = getInstalledCommit(skill);
        const latestCommit = marketSkill.commitHash;
        const hasUpdate = !!(installedCommit && latestCommit && installedCommit !== latestCommit);
        updates.push({
            skill,
            marketSkill,
            hasUpdate,
            installedCommit,
            latestCommit,
        });
    }
    return updates;
}
/**
 * Check if a specific skill has an update available
 */
function hasUpdateAvailable(skillName, installedSkills, marketSkills) {
    const skill = installedSkills.find((s) => s.name === skillName);
    if (!skill) {
        return false;
    }
    const marketSkill = marketSkills.find((ms) => ms.name === skillName);
    if (!marketSkill) {
        return false;
    }
    const installedCommit = getInstalledCommit(skill);
    const latestCommit = marketSkill.commitHash;
    return !!(installedCommit && latestCommit && installedCommit !== latestCommit);
}
//# sourceMappingURL=updateService.js.map