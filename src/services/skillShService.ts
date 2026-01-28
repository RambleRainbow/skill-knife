import axios from 'axios';

export interface SkillShResult {
    id: string;
    name: string;
    installs: number;
    topSource: string; // "owner/repo"
}

export interface SkillShResponse {
    skills: SkillShResult[];
    count: number;
}

export class SkillShService {
    private static readonly API_URL = 'https://skills.sh/api/search';

    /**
     * Search skills on skills.sh
     * @param query Search query
     * @param limit Number of results (default 50)
     */
    public static async search(query: string, limit: number = 50): Promise<SkillShResult[]> {
        if (!query || query.trim().length === 0) {
            return [];
        }

        try {
            const response = await axios.get<SkillShResponse>(this.API_URL, {
                params: {
                    q: query,
                    limit
                }
            });

            return response.data.skills || [];
        } catch (error) {
            console.error('Failed to search skills.sh:', error);
            return [];
        }
    }

    /**
     * Get featured/top skills by scraping the homepage
     */
    public static async getFeaturedSkills(): Promise<SkillShResult[]> {
        try {
            const response = await axios.get('https://skills.sh', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            const html = response.data as string;

            const results: SkillShResult[] = [];
            // Regex to match skill cards on homepage
            // Looking for links: href="/owner/repo/name" (3 parts)
            const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
            let match;

            while ((match = linkRegex.exec(html)) !== null) {
                const href = match[1];
                const content = match[2];

                // Parse href: /owner/repo/name
                const parts = href.split('/').filter(p => p);
                if (parts.length === 3 && href.startsWith('/')) {
                    const topSource = `${parts[0]}/${parts[1]}`;
                    const name = parts[2];

                    // Parse content for installs
                    // Usually in the last span: <span ...>9.2K</span>
                    const installMatch = content.match(/>([\d.]+[KkMm]?)</g);
                    let installs = 0;
                    if (installMatch && installMatch.length > 0) {
                        try {
                            // Get last match, remove > and <
                            const raw = installMatch[installMatch.length - 1].replace(/[><]/g, '');
                            installs = this._parseInstalls(raw);
                        } catch (e) { /* ignore */ }
                    }

                    results.push({
                        id: name,
                        name: name,
                        topSource: topSource,
                        installs: installs
                    });
                }

                if (results.length >= 50) break;
            }

            return results;
        } catch (error) {
            console.error('Failed to get featured skills:', error);
            return [];
        }
    }

    private static _parseInstalls(raw: string): number {
        raw = raw.toUpperCase();
        let multiplier = 1;
        if (raw.endsWith('K')) {
            multiplier = 1000;
            raw = raw.slice(0, -1);
        } else if (raw.endsWith('M')) {
            multiplier = 1000000;
            raw = raw.slice(0, -1);
        }
        return Math.floor(parseFloat(raw) * multiplier);
    }

    /**
     * Scrape skill details from the website
     */
    public static async getSkillDetails(skill: SkillShResult): Promise<{ description?: string; installCmd?: string }> {
        try {
            const url = `https://skills.sh/${skill.topSource}/${skill.id}`;
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            const html = response.data as string;

            // Scrape Install Command
            const cmdMatch = html.match(/npx skills add\s+([^<]+)/);
            const installCmd = cmdMatch ? `npx skills add ${cmdMatch[1]}` : undefined;

            // Scrape Description
            let description = undefined;
            const proseMatch = html.match(/class="prose[^"]*">([\s\S]*?)<\/div>/);
            if (proseMatch) {
                const rawHtml = proseMatch[1];
                description = rawHtml.replace(/<[^>]*>/g, '').trim();
                if (description.length > 500) {
                    description = description.substring(0, 500) + '...';
                }
            }

            return { description, installCmd };
        } catch (error) {
            console.warn(`Failed to fetch details for ${skill.name}:`, error);
            return {};
        }
    }
}
