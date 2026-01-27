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
