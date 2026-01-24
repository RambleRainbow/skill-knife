# Plan: SkillKnife UI/UX & Persistence Overhaul

## 1. UI Refinements & Adaptive View
- [ ] **Cleanup `package.json`**:
    - Remove `skillKnife.filter` from `view/title` menu (the "search button").
- [ ] **Implement Adaptive View Strategy**:
    - Add `viewsContainers` entry for a custom Activity Bar icon.
    - Add a new view `skillKnifeSidebarView` in this custom container.
    - Rename the existing explorer view to `skillKnifeExplorerView`.
    - Register the `SkillKnifeTreeDataProvider` for **both** views in `extension.ts`.
    - Update `package.json` menu contributions to apply to both view IDs.
- [ ] **Context Key**:
    - Ensure `skillKnife.location` config controls visibility via `when` clauses (e.g., `config.skillKnife.location == 'sidebar'`).

## 2. Persistence Layer (`~/.cache/skill-knife`)
- [ ] **Create `PersistenceService`**:
    - `ensureCacheDir()`: Create `~/.cache/skill-knife`.
    - `getUserMarkets()` / `saveUserMarkets(markets)`: Manage `markets.json`.
    - `getProfiles()` / `saveProfile(name, skills)`: Manage `profiles.json`.
- [ ] **Refactor `MarketService`**:
    - Extract current `package.json` markets to `src/config/defaults.ts`.
    - `getMarkets()`: Return `[...UserMarkets, ...DefaultMarkets]`.

## 3. Market Management (Webview)
- [ ] **Update `MarketPanel` Frontend**:
    - Add "Add Market" section (Name + Git URL inputs + Add Button).
    - Update Market List items to show a "Trash/Global" icon for **custom** markets only (defaults are immutable).
- [ ] **Update `MarketPanel` Backend**:
    - Handle `addMarket` message: Validate -> Save to `PersistenceService` -> Refresh.
    - Handle `removeMarket` message: Validate -> Remove from `PersistenceService` -> Refresh.

## 4. Skill Profiles
- [ ] **Add Commands**:
    - `skillKnife.saveProfile`:
        - Get currently installed skills (Project scope).
        - Prompt user for Profile Name.
        - Save to `PersistenceService`.
    - `skillKnife.loadProfile`:
        - Show QuickPick of available profiles.
        - On select: Compare profile list vs installed.
        - Run `openskills install` for missing items (Merge strategy).

## 5. Migration (Optional)
- [ ] Deprecate/Remove `skillKnife.markets` from `package.json` configuration config, as we now use the file-based system + defaults.
