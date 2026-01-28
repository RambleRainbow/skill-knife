/**
 * @file test_skill_sh.js
 * @description 
 * This script is an experimental tool used to reverse-engineer and verify the data extraction 
 * logic for the `skills.sh` website. 
 * 
 * It was created during the development of the "Global Search" feature for Skill Knife.
 * Its primary purpose is to:
 * 1. Fetch the raw HTML of a skill detail page.
 * 2. Attempt to locate Next.js hydration data (`__NEXT_DATA__`) to see if structured data is available.
 * 3. Log findings to the console to assist in determining the best scraping strategy.
 * 
 * Usage:
 * Run with node: `node tools/test_skill_sh.js`
 * 
 * Dependencies:
 * - axios
 */

const axios = require('axios');

async function test() {
    // const url = 'https://skills.sh/sickn33/antigravity-awesome-skills/docker-expert';
    const url = 'https://skills.sh';
    try {
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const html = res.data;

        console.log('HTML Length:', html.length);

        // Strategy 1: Find links like href="/owner/repo" that look like skills
        // The structure usually has <a href="/owner/repo/skill"...
        // Let's look for href="([^"]+)" and see if we can filter.

        // Actually, let's dump some <a> tags
        const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
        let match;
        let count = 0;

        console.log('--- Printing first 10 skill-like links ---');
        while ((match = linkRegex.exec(html)) !== null) {
            const href = match[1];
            const content = match[2];

            // skill links are usually 3 parts: /owner/repo/name (wait, actually URL is /owner/repo/skill_id usually?)
            // or just /owner/repo sometimes? 
            // The detail page URL we used before was https://skills.sh/sickn33/antigravity-awesome-skills/docker-expert
            // So path is /owner/repo/skillName

            const parts = href.split('/').filter(p => p);
            if (parts.length === 3 && href.startsWith('/')) {
                // Likely a skill
                console.log('Href:', href);
                // Print content to debug structure
                console.log('Content:', content.replace(/\s+/g, ' ').trim());
                count++;
                if (count > 5) break;
            }
        }
    } catch (e) {
        console.error(e);
    }
}

test();
