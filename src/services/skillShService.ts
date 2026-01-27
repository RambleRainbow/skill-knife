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
}
