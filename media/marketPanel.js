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
    agentList: document.getElementById('agent-list'),
    saveProfileBtn: document.getElementById('saveProfileBtn')
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

    const html = filteredSkills.map((skill, index) => {
        const installedSkill = state.installedSkills.find(s => s.name === skill.name);
        const isInstalled = !!installedSkill;

        // Determine update availability
        let hasUpdate = false;
        if (isInstalled && installedSkill) {
            // Simple version check if available
            if (skill.version && installedSkill.version && skill.version !== installedSkill.version) {
                hasUpdate = true;
            }
        }

        // Dual Scope Actions
        const isProjectInstalled = installedSkill && installedSkill.installations.some(i => i.scope === 'project');
        const isGlobalInstalled = installedSkill && installedSkill.installations.some(i => i.scope === 'global');

        const SCOPE_ICONS = {
            project: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><rect x="3" y="3" width="10" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><text x="8" y="11" font-family="sans-serif" font-size="8" text-anchor="middle" fill="currentColor" font-weight="bold">P</text></svg>`,
            global: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2"/><text x="8" y="11" font-family="sans-serif" font-size="8" text-anchor="middle" fill="currentColor" font-weight="bold">G</text></svg>`
        };

        // Project Button
        const projectAction = isProjectInstalled ? 'uninstall' : 'install';
        const projectClass = isProjectInstalled ? 'active' : 'inactive';
        const projectTitle = isProjectInstalled ? 'Uninstall from Project' : 'Install to Project';
        const projectIcon = SCOPE_ICONS.project;

        const projectBtn = `<button class="scope-action-btn ${projectClass} project" onclick="handleScopeAction('${projectAction}', '${escapeHtml(skill.name)}', 'project', event)" title="${projectTitle}">${projectIcon}</button>`;

        // Global Button
        const globalAction = isGlobalInstalled ? 'uninstall' : 'install';
        const globalClass = isGlobalInstalled ? 'active' : 'inactive';
        const globalTitle = isGlobalInstalled ? 'Uninstall Globally' : 'Install Globally';
        const globalIcon = SCOPE_ICONS.global;

        const globalBtn = `<button class="scope-action-btn ${globalClass} global" onclick="handleScopeAction('${globalAction}', '${escapeHtml(skill.name)}', 'global', event)" title="${globalTitle}">${globalIcon}</button>`;


        const buttonHtml = `<div class="scope-actions">${projectBtn}${globalBtn}</div>`;

        // Unique ID for DOM manipulation
        const cardId = `card-${index}`;
        const detailsId = `details-${index}`;

        let metaHtml = '';
        let overview = (skill.description || '').trim() || 'No description available.';

        // Determine Market Type (Global vs Local) based on property or convention
        const isGlobal = (skill.market && skill.market.name === SKILL_SH_MARKET_NAME);

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

            // Source Logic: Prefer repoPath, fallback to "Source" but never generic "GitHub" without link
            const sourceText = skill.repoPath || 'Source';

            metaHtml = `
           <div class="skill-meta-stack">
             <div class="meta-row">
                <span style="font-size:11px; font-weight:500;">${installCount}</span>
             </div>
             <div class="meta-row">
                <a href="https://github.com/${skill.repoPath}" class="source-link" title="View Source">
                    ${sourceText}
                </a>
             </div>
           </div>
        `;
        }

        // Search data attribute
        const searchContent = `${skill.name} ${overview}`.toLowerCase();

        const isExpanded = state.expandedSkills && state.expandedSkills.includes(skill.name);

        return `
      <div class="skill-card ${isExpanded ? 'expanded' : ''}" id="${cardId}" onclick="toggleDetails(${index}, '${escapeHtml(skill.name)}', event)" data-search-content="${escapeHtml(searchContent)}">
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
        <div class="skill-details ${isExpanded ? '' : 'hidden'}" id="${detailsId}">
            <div class="detail-content">
                <div class="detail-row">
                    <strong class="section-title">Overview:</strong>
                    <p class="full-description">${escapeHtml(overview)}</p>
                </div>
                <div class="detail-row management-section">
                    <strong class="section-title">Manage Installation</strong>
                    <div class="scope-grid">
                        <!-- Project Scope Card -->
                        <div class="scope-card ${isProjectInstalled ? 'installed' : ''}">
                            <div class="scope-header">
                                ${SCOPE_ICONS.project}
                                <span class="scope-name">Project</span>
                                ${isProjectInstalled ? '<span class="status-badge installed">Installed</span>' : '<span class="status-badge">Available</span>'}
                            </div>
                            <button class="scope-action-btn-large ${isProjectInstalled ? 'destructive' : 'primary'}"
                                onclick="handleScopeAction('${isProjectInstalled ? 'uninstall' : 'install'}', '${escapeHtml(skill.name)}', 'project', event)">
                                ${isProjectInstalled ? 'Uninstall from Project' : 'Install to Project'}
                            </button>
                        </div>

                        <!-- Global Scope Card -->
                        <div class="scope-card ${isGlobalInstalled ? 'installed' : ''}">
                            <div class="scope-header">
                                ${SCOPE_ICONS.global}
                                <span class="scope-name">Global</span>
                                ${isGlobalInstalled ? '<span class="status-badge installed">Installed</span>' : '<span class="status-badge">Available</span>'}
                            </div>
                            <button class="scope-action-btn-large ${isGlobalInstalled ? 'destructive' : 'primary'}"
                                onclick="handleScopeAction('${isGlobalInstalled ? 'uninstall' : 'install'}', '${escapeHtml(skill.name)}', 'global', event)">
                                ${isGlobalInstalled ? 'Uninstall Globally' : 'Install Globally'}
                            </button>
                        </div>
                    </div>
                </div>

                <div class="detail-row install-section">
                    <strong class="section-title" style="margin-top:12px">Manual Command</strong>
                    <div class="install-block">
                        <div class="cmd-text">${escapeHtml(skill.installCmd || `npx skills add ${skill.repoPath || skill.name}`)}</div>
                        <button class="action-btn copy-btn" onclick="copyCmd(${index}, event)" title="Copy Command">Copy</button>
                    </div>
                </div>
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

function handleScopeAction(command, skillName, scope, event) {
    if (event) {
        event.stopPropagation();
        const btn = event.currentTarget; // The button element
        if (btn) {
            btn.classList.add('loading');
            // Optional: Change icon to spinner or just rely on CSS
            // btn.innerHTML = ICONS.spinner; // If we had one
        }
    }
    postCommand(command, skillName, scope);
}

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

function toggleDetails(index, skillName, event) {
    // 0. Stop propagation if triggered from inner elements (though they usually have their own handlers)
    // Actually no, we want card click to toggle. But let's accept it.

    // 1. Update State (semantic expansion)
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
    // Use unique index-based IDs
    const details = document.getElementById('details-' + index);
    const card = document.getElementById('card-' + index);
    if (!details || !card) return; // Should not happen

    if (expanding) {
        details.classList.remove('hidden');
        card.classList.add('expanded');
    } else {
        details.classList.add('hidden');
        card.classList.remove('expanded');
    }
}

function copyCmd(index, event) {
    if (event) event.stopPropagation();
    const card = document.getElementById('card-' + index);
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
        // Use repoPath for precise matching if available (common in searches), fallback to name
        const skill = state.skills.find(s => {
            if (message.repoPath && s.repoPath) {
                return s.repoPath === message.repoPath;
            }
            return s.name === message.skillName;
        });
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
