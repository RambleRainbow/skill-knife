import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Market, SkillProfile } from '../types';

const BASE_DIR = path.join(os.homedir(), '.cache', 'skill-knife');
const MARKETS_FILE = path.join(BASE_DIR, 'markets.json');
const PROFILES_FILE = path.join(BASE_DIR, 'profiles.json');

/**
 * Service to manage persistent data (Custom Markets, Profiles)
 */
export class PersistenceService {

    private static ensureDir() {
        if (!fs.existsSync(BASE_DIR)) {
            fs.mkdirSync(BASE_DIR, { recursive: true });
        }
    }

    /**
     * Get user-defined custom markets
     */
    static getUserMarkets(): Market[] {
        try {
            if (fs.existsSync(MARKETS_FILE)) {
                const content = fs.readFileSync(MARKETS_FILE, 'utf-8');
                const data = JSON.parse(content);
                return Array.isArray(data.markets) ? data.markets : [];
            }
        } catch (e) {
            console.error('Failed to read user markets:', e);
        }
        return [];
    }

    /**
     * Save user-defined custom markets
     */
    static saveUserMarkets(markets: Market[]) {
        this.ensureDir();
        try {
            fs.writeFileSync(MARKETS_FILE, JSON.stringify({ markets }, null, 2));
        } catch (e) {
            console.error('Failed to save user markets:', e);
            throw e;
        }
    }

    /**
     * Get all saved profiles
     */
    static getProfiles(): Record<string, SkillProfile> {
        try {
            if (fs.existsSync(PROFILES_FILE)) {
                const content = fs.readFileSync(PROFILES_FILE, 'utf-8');
                const data = JSON.parse(content);
                return data.profiles || {};
            }
        } catch (e) {
            console.error('Failed to read profiles:', e);
        }
        return {};
    }

    /**
     * Save a profile
     */
    static saveProfile(profile: SkillProfile) {
        this.ensureDir();
        const profiles = this.getProfiles();
        profiles[profile.name] = profile;

        try {
            fs.writeFileSync(PROFILES_FILE, JSON.stringify({ profiles }, null, 2));
        } catch (e) {
            console.error('Failed to save profile:', e);
            throw e;
        }
    }

    /**
     * Delete a profile
     */
    static deleteProfile(name: string) {
        this.ensureDir();
        const profiles = this.getProfiles();
        if (profiles[name]) {
            delete profiles[name];
            try {
                fs.writeFileSync(PROFILES_FILE, JSON.stringify({ profiles }, null, 2));
            } catch (e) {
                console.error('Failed to delete profile:', e);
                throw e;
            }
        }
    }
}
