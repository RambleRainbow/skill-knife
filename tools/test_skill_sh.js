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
    const url = 'https://skills.sh/sickn33/antigravity-awesome-skills/docker-expert';
    try {
        const res = await axios.get(url);
        const html = res.data;
        const regex = /<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/;
        const match = html.match(regex);
        if (match) {
            const data = JSON.parse(match[1]);
            console.log('Found NEXT_DATA');
            // Explore the structure to find description and install command
            // Usually in props.pageProps.skill or similar
            console.log('Keys:', Object.keys(data.props.pageProps));
            if (data.props.pageProps.skill) {
                const s = data.props.pageProps.skill;
                console.log('Skill Name:', s.name);
                console.log('Installation:', s.installation); // Guessing keys
                console.log('Description length:', s.readme ? s.readme.length : 'N/A');

                // print snippet of skill object keys
                console.log('Skill Keys:', Object.keys(s));
            }
        } else {
            console.log('No NEXT_DATA found');
            console.log('HTML snippet:', html.substring(0, 500));
        }
    } catch (e) {
        console.error(e);
    }
}

test();
