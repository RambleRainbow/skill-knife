const vscode = acquireVsCodeApi();

// State management
const previousState = vscode.getState();
let state = previousState || window.skillKnifeData || {
    markets: [],
    currentMarket: null,
    skills: [],
    installedSkills: [],
    preferredAgents: [],
    allAgents: [],
    searchText: '',
    loading: false,
    expandedSkills: []
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

        // Dual Scope Actions
        const isProjectInstalled = installedSkill && installedSkill.installations.some(i => i.scope === 'project');
        const isGlobalInstalled = installedSkill && installedSkill.installations.some(i => i.scope === 'global');

        // Project Button
        const projectAction = isProjectInstalled ? 'uninstall' : 'install';
        const projectClass = isProjectInstalled ? 'active' : 'inactive';
        const projectTitle = isProjectInstalled ? 'Uninstall from Project' : 'Install (Project)';
        // SVGs: Project (Box)
        const projectIcon = `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M14.5 3H10.9L9.4 1.3C9.3 1.1 9 1 8.8 1H3.5C2.7 1 2 1.7 2 2.5V13.5C2 14.3 2.7 15 3.5 15H12.5C13.3 15 14 14.3 14 13.5V3.5C14 3.2 13.8 3 13.5 3H14.5ZM13 13.5C13 13.8 12.8 14 12.5 14H3.5C3.2 14 3 13.8 3 13.5V2.5C3 2.2 3.2 2 3.5 2H8.5L10 3.7V4H12.5C12.8 4 13 4.2 13 4.5V13.5Z"/></svg>`;

        const projectBtn = `<button class="scope-action-btn ${projectClass} project" onclick="postCommand('${projectAction}', '${escapeHtml(skill.name)}', 'project')" title="${projectTitle}">${projectIcon}</button>`;

        // Global Button
        const globalAction = isGlobalInstalled ? 'uninstall' : 'install';
        const globalClass = isGlobalInstalled ? 'active' : 'inactive';
        const globalTitle = isGlobalInstalled ? 'Uninstall Globally' : 'Install Globally';
        // SVGs: Global (Globe)
        const globalIcon = `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M8 1C4.1 1 1 4.1 1 8C1 11.9 4.1 15 8 15C11.9 15 15 11.9 15 8C15 4.1 11.9 1 8 1ZM12.9 6H13.9C13.5 4.1 12.3 2.5 10.6 1.6C11.8 2.8 12.5 4.3 12.9 6ZM8 2C9.5 2 10.8 2.8 11.6 4H4.4C5.2 2.8 6.5 2 8 2ZM3.1 6H4.1C4.4 3.9 5.3 2.1 6.6 0.8C4.5 1.5 2.8 3.5 2.2 6H3.1ZM2 8C2 8.3 2 8.7 2.1 9H3.1C3 8.7 3 8.3 3 8C3 7.7 3 7.3 3.1 7H2.1C2 7.3 2 7.7 2 8ZM3.1 10H2.2C2.8 12.5 4.5 14.5 6.6 15.2C5.3 13.9 4.4 12.1 4.1 10ZM8 14C6.5 14 5.2 13.2 4.4 12H11.6C10.8 13.2 9.5 14 8 14ZM10.6 14.4C12.3 13.5 13.5 11.9 13.9 10H12.9C12.5 11.7 11.8 13.2 10.6 14.4ZM13 8C13 8.3 13 8.7 12.9 9H13.9C14 8.7 14 8.3 14 8C14 7.7 14 7.3 13.9 7H12.9C13 7.3 13 7.7 13 8ZM4.3 9H11.7C11.6 10.3 11.1 11.5 10.1 12.3C9.5 12.8 8.8 13 8 13C7.2 13 6.5 12.8 5.9 12.3C4.9 11.5 4.4 10.3 4.3 9ZM11.7 7H4.3C4.4 5.7 4.9 4.5 5.9 3.7C6.5 3.2 7.2 3 8 3C8.8 3 9.5 3.2 10.1 3.7C11.1 4.5 11.6 5.7 11.7 7Z"/></svg>`;

        const globalBtn = `<button class="scope-action-btn ${globalClass} global" onclick="postCommand('${globalAction}', '${escapeHtml(skill.name)}', 'global')" title="${globalTitle}">${globalIcon}</button>`;

        buttonHtml = `<div class="scope-actions">${projectBtn}${globalBtn}</div>`;

        let metaHtml = '';
        let overview = (skill.description || '').trim() || 'No description available.';

        if (isGlobal) {
            // Use installs property if available, fallback to parsing description for legacy/compatibility
            let installCount = skill.installs !== undefined ? skill.installs : 0;

            // If no property (or 0), try to parse from description as fallback
            if (!installCount) {
                const match = (skill.description || '').match(/Installs: (\d+)/);
                if (match) installCount = match[1];
            }

            // Always clean up the overview text to remove the "Installs: N" string if present
            overview = (skill.description || '').replace(/Installs: \d+/, '').trim() || 'No description available.';

            metaHtml = `
           <div class="skill-meta-stack">
             <div class="meta-row">
                <span style="font-size:11px; font-weight:500;">${installCount}</span>
             </div>
             <div class="meta-row">
                <a href="https://github.com/${skill.repoPath}" class="source-link" title="View Source">
                    GitHub
                </a>
             </div>
           </div>
        `;
        }

        // Search data attribute
        const searchContent = `${skill.name} ${overview}`.toLowerCase();

        const isExpanded = state.expandedSkills && state.expandedSkills.includes(skill.name);

        return `
      <div class="skill-card ${isExpanded ? 'expanded' : ''}" id="card-${escapeHtml(skill.name)}" onclick="toggleDetails('${escapeHtml(skill.name)}')" data-search-content="${escapeHtml(searchContent)}">
        <div class="skill-header">
          <div class="header-left">
            <div class="skill-icon">
              ${ICONS.tools}
            </div>
            <span class="skill-name" title="${escapeHtml(skill.name)}">${escapeHtml(skill.name)}</span>
          </div>
          <div class="header-right">

            ${metaHtml}
            <div onclick="event.stopPropagation()">${buttonHtml}</div>
          </div>
        </div>
        <div class="skill-details ${isExpanded ? '' : 'hidden'}" id="details-${escapeHtml(skill.name)}">
            <div class="detail-content">
                <div class="detail-row">
                    <strong class="section-title">Overview:</strong>
                    <p class="full-description">${escapeHtml(overview)}</p>
                </div>
                ${!isInstalled ? `
                <div class="detail-row install-section">
                    <div class="install-block">
                        <div class="cmd-text">${escapeHtml(skill.installCmd || `npx skills add ${skill.repoPath || skill.name}`)}</div>
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

function postCommand(command, arg, scope) {
    const msg = { command };
    if (command === 'selectMarket') msg.marketName = arg;
    if (command === 'install' || command === 'update' || command === 'uninstall') {
        msg.skillName = arg;
        if (scope) msg.scope = scope;
    }
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
        vscode.setState(state);

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
    // 1. Update State
    if (!state.expandedSkills) state.expandedSkills = [];
    const idx = state.expandedSkills.indexOf(skillName);

    let expanding = false;
    if (idx === -1) {
        state.expandedSkills.push(skillName);
        expanding = true;
    } else {
        state.expandedSkills.splice(idx, 1);
        expanding = false;
    }
    vscode.setState(state);

    // 2. Update DOM immediately (faster than full re-render)
    const details = document.getElementById('details-' + skillName);
    const card = document.getElementById('card-' + skillName);
    if (!details || !card) return; // Should not happen

    if (expanding) {
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
        vscode.setState(state);
        render();
    }

    if (message.command === 'updateSkill') {
        // Find skill and update
        const skill = state.skills.find(s => s.name === message.skillName);
        if (skill) {
            if (message.description) skill.description = message.description;
            if (message.installCmd) skill.installCmd = message.installCmd;
            // Re-render only if needed, or re-render all for simplicity
            // Optimization: re-render specific card if heavy
            vscode.setState(state);
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
