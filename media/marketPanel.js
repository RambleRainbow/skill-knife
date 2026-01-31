const vscode = acquireVsCodeApi();

// State management
let state = window.skillKnifeData || {
    markets: [],
    currentMarket: null,
    skills: [],
    installedSkills: [],
    preferredAgents: [],
    allAgents: [],
    searchText: '',
    loading: false
};

// DOM Elements
const elements = {
    marketSelect: document.getElementById('marketSelect'),
    searchInput: document.getElementById('searchInput'),
    refreshBtn: document.getElementById('refreshBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    cancelSettingsBtn: document.getElementById('cancelSettingsBtn'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    skillsContainer: document.getElementById('skills-container'),
    settingsModal: document.getElementById('settings-modal'),
    agentList: document.getElementById('agent-list')
};

// Icons (replicated from TS logic)
const ICONS = {
    project: '<span class="scope-badge project" title="Project Installed">P</span>',
    global: '<span class="scope-badge global" title="Global Installed">G</span>',
    cloud: '<span class="codicon codicon-cloud-download"></span>',
    github: '<span class="codicon codicon-github-inverted"></span>',
    tools: '<span class="codicon codicon-tools"></span>'
};

const SKILL_SH_MARKET_NAME = 'Global Search (skills.sh)';

// --- Rendering Logic ---

function render() {
    renderMarketControls();
    renderSkills();
}

function renderMarketControls() {
    if (!elements.marketSelect) return;

    const optionsHtml = state.markets.map(m => {
        // Basic logic for custom mark: if it's not default (pseudo-check here or passed from backend)
        // For now simple name check
        const isSelected = state.currentMarket && state.currentMarket.name === m.name;
        const displayName = m.name; // Simplification, backend logic for '*' was useful but let's stick to name for now
        return `<option value="${escapeHtml(m.name)}" ${isSelected ? 'selected' : ''}>${escapeHtml(displayName)}</option>`;
    }).join('');

    elements.marketSelect.innerHTML = optionsHtml;

    // Set search box value
    if (elements.searchInput) {
        elements.searchInput.value = state.searchText || '';
    }
}

function renderSkills() {
    if (!elements.skillsContainer) return;

    if (state.loading) {
        elements.skillsContainer.innerHTML = '<div class="loading">Loading skills...</div>';
        return;
    }

    if (!state.skills || state.skills.length === 0) {
        const msg = state.searchText ? 'No skills found matching your search.' : 'No skills available in this market.';
        elements.skillsContainer.innerHTML = `<div class="empty">${msg}</div>`;
        return;
    }

    // Client-side filtering
    let filteredSkills = state.skills;
    // Apply immediate filter if not global market
    const isGlobal = state.currentMarket?.name === SKILL_SH_MARKET_NAME;
    if (state.searchText && !isGlobal) {
        const term = state.searchText.toLowerCase();
        filteredSkills = state.skills.filter(s =>
            s.name.toLowerCase().includes(term) ||
            (s.description && s.description.toLowerCase().includes(term))
        );
    }

    if (filteredSkills.length === 0) {
        elements.skillsContainer.innerHTML = `<div class="empty">No skills found matching your search.</div>`;
        return;
    }

    const html = filteredSkills.map(skill => {
        const installedSkill = state.installedSkills.find(s => s.name === skill.name);
        const isInstalled = !!installedSkill;

        // Determine update availability
        let hasUpdate = false;
        if (isInstalled && installedSkill) {
            // Simple version check if available
            // Note: Logic mirrored from TS `hasUpdateAvailable`
            // We assume backend passes processed flags or we do simple compare
            // For Robustness: let's rely on backend passing 'hasUpdate' flag in skill object ideally
            // BUT current state structure likely needs raw data. 
            // Let's implement simplified check: installed version != market version
            if (skill.version && installedSkill.version && skill.version !== installedSkill.version) {
                hasUpdate = true;
            }
        }

        let buttonHtml;
        let badgesHtml = '';

        if (isInstalled && installedSkill) {
            if (installedSkill.installations) {
                const scopes = new Set(installedSkill.installations.map(i => i.scope));
                if (scopes.has('project')) badgesHtml += ICONS.project;
                if (scopes.has('global')) badgesHtml += ICONS.global;
            }

            if (hasUpdate) {
                buttonHtml = `<button class="action-btn update-btn" onclick="postCommand('update', '${escapeHtml(skill.name)}')">Update</button>`;
            } else {
                buttonHtml = `<button class="action-btn uninstall-btn" onclick="postCommand('uninstall', '${escapeHtml(skill.name)}')">Uninstall</button>`;
            }
        } else {
            buttonHtml = `<button class="action-btn install-btn" onclick="postCommand('install', '${escapeHtml(skill.name)}')">Install</button>`;
        }

        let metaHtml = '';
        let overview = (skill.description || '').trim() || 'No description available.';

        if (isGlobal) {
            // Parse installs from desc (Hack from TS logic)
            const match = (skill.description || '').match(/Installs: (\d+)/);
            const installCount = match ? match[1] : '0';
            overview = (skill.description || '').replace(/Installs: \d+/, '').trim() || 'No description available.';

            metaHtml = `
           <div class="skill-meta-stack">
             <div class="meta-row">
                ${ICONS.cloud}
                <span>${installCount}</span>
             </div>
             <div class="meta-row">
                <a href="https://github.com/${skill.repoPath}" class="source-link" title="View Source">
                    ${ICONS.github}
                    GitHub
                </a>
             </div>
           </div>
        `;
        }

        // Search data attribute
        const searchContent = `${skill.name} ${overview}`.toLowerCase();

        return `
      <div class="skill-card" id="card-${escapeHtml(skill.name)}" onclick="toggleDetails('${escapeHtml(skill.name)}')" data-search-content="${escapeHtml(searchContent)}">
        <div class="skill-header">
          <div class="header-left">
            <div class="skill-icon">
              ${ICONS.tools}
            </div>
            <span class="skill-name" title="${escapeHtml(skill.name)}">${escapeHtml(skill.name)}</span>
          </div>
          <div class="header-right">
            <div class="scope-badges">${badgesHtml}</div>
            ${metaHtml}
            <div onclick="event.stopPropagation()">${buttonHtml}</div>
          </div>
        </div>
        <div class="skill-details hidden" id="details-${escapeHtml(skill.name)}">
            <div class="detail-content">
                <div class="detail-row">
                    <strong class="section-title">Overview:</strong>
                    <p class="full-description">${escapeHtml(overview)}</p>
                </div>
                ${!isInstalled ? `
                <div class="detail-row install-section">
                    <div class="install-block">
                        <div class="cmd-text">npx skills add ${escapeHtml(skill.repoPath || skill.name)}</div>
                        <button class="action-btn copy-btn" onclick="copyCmd('${escapeHtml(skill.name)}', event)" title="Copy Command">Copy</button>
                    </div>
                </div>` : ''}
            </div>
            <div class="detail-loading" style="display:none">Loading details...</div>
        </div>
      </div>
    `;
    }).join('');

    elements.skillsContainer.innerHTML = html;
}

function renderSettings() {
    if (!elements.agentList) return;

    const html = state.allAgents.map(agent => {
        const isAll = state.preferredAgents.length === 0;
        const checked = isAll || state.preferredAgents.includes(agent.id) ? 'checked' : '';
        return `<div class="agent-item">
         <input type="checkbox" id="chk-${agent.id}" value="${agent.id}" ${checked}>
         <label for="chk-${agent.id}">${escapeHtml(agent.name)}</label>
      </div>`;
    }).join('');

    elements.agentList.innerHTML = html;
}


// --- Interaction Logic ---

function postCommand(command, arg) {
    const msg = { command };
    if (command === 'selectMarket') msg.marketName = arg;
    if (command === 'install' || command === 'update' || command === 'uninstall') msg.skillName = arg;
    if (command === 'search') msg.searchText = arg;
    if (command === 'saveSettings') msg.agents = arg;

    vscode.postMessage(msg);
}

// Event Listeners setup
function setupEventListeners() {
    elements.marketSelect?.addEventListener('change', (e) => postCommand('selectMarket', e.target.value));

    elements.searchInput?.addEventListener('input', (e) => {
        const text = e.target.value;
        state.searchText = text; // Optimistic update

        // Local Filter immediate feedback
        const isGlobal = state.currentMarket?.name === SKILL_SH_MARKET_NAME;
        if (!isGlobal) {
            renderSkills(); // Re-render to filter locally
        }

        // Debounce actual search
        if (window.searchTimeout) clearTimeout(window.searchTimeout);
        window.searchTimeout = setTimeout(() => {
            postCommand('search', text);
        }, 500);
    });

    elements.refreshBtn?.addEventListener('click', () => postCommand('refresh'));

    elements.settingsBtn?.addEventListener('click', toggleSettings);
    elements.cancelSettingsBtn?.addEventListener('click', toggleSettings);
    elements.saveSettingsBtn?.addEventListener('click', saveSettings);
}

// Handlers (from old JS)

function toggleDetails(skillName) {
    const details = document.getElementById('details-' + skillName);
    const card = document.getElementById('card-' + skillName);
    if (!details || !card) return;

    if (details.classList.contains('hidden')) {
        details.classList.remove('hidden');
        card.classList.add('expanded');
    } else {
        details.classList.add('hidden');
        card.classList.remove('expanded');
    }
}

function copyCmd(skillName, event) {
    if (event) event.stopPropagation();
    const card = document.getElementById('card-' + skillName);
    const cmd = card.querySelector('.cmd-text').innerText;
    navigator.clipboard.writeText(cmd);
}

function toggleSettings() {
    if (elements.settingsModal.classList.contains('hidden')) {
        renderSettings();
        elements.settingsModal.classList.remove('hidden');
    } else {
        elements.settingsModal.classList.add('hidden');
    }
}

function saveSettings() {
    const checkboxes = document.querySelectorAll('#agent-list input[type="checkbox"]');
    const selected = [];
    checkboxes.forEach(chk => {
        if (chk.checked) selected.push(chk.value);
    });
    postCommand('saveSettings', selected);
    toggleSettings();
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Handle messages from Extension
window.addEventListener('message', event => {
    const message = event.data;

    if (message.command === 'updateState') {
        // Merge state
        state = { ...state, ...message.state };
        render();
    }

    if (message.command === 'updateSkill') {
        // Find skill and update
        const skill = state.skills.find(s => s.name === message.skillName);
        if (skill) {
            if (message.description) skill.description = message.description;
            // Re-render only if needed, or re-render all for simplicity
            // Optimization: re-render specific card if heavy
            renderSkills();
        }
    }
});

// Init
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    render();

    // Auto-focus search if it has value
    if (state.searchText && elements.searchInput) {
        elements.searchInput.focus();
        const len = state.searchText.length;
        elements.searchInput.setSelectionRange(len, len);
    }
});
