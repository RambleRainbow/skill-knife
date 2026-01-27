# Market Search Integration Design

## 1. Brainstorming & Analysis
**Goal**: Integrate `skills.sh` search capabilities into the Skill Knife Market Webview to allow users to discover skills globally.

### Analysis of `skills.sh`
-   **Mechanism**: The website uses a "search-as-you-type" mechanism.
-   **API**: It queries `GET https://skills.sh/api/search?q={query}&limit={limit}`.
-   **Response**: Returns a JSON object with a `skills` array containing `id`, `name`, `installs`, and `topSource`.
-   **UX**: Fast, clean, table-based results.

### Brainstorming Options
| Option | Description | Pros | Cons |
| :--- | :--- | :--- | :--- |
| **A. Iframe Integration** | Embed `skills.sh` directly using an `<iframe>`. | • Zero development effort for UI.<br>• Exact visual match with the website. | • Visual inconsistency with VS Code themes (Dark/Light mismatch).<br>• CSP restrictions might block it.<br>• Cannot directly trigger "Install" actions in the extension. |
| **B. Link-out Only** | Add a search bar that opens the default browser. | • Simple to implement. | • Disrupts user flow (leaves IDE).<br>• Low engagement. |
| **C. Native API Integration** | Call the `skills.sh` API from the extension and render results natively in the Webview. | • **Premium Experience**: Fully customizable UI matching VS Code.<br>• **Actionable**: Can add "Install" buttons directly to results.<br>• **Unified**: Feels like a built-in feature. | • Higher development effort.<br>• Requires maintaining API compatibility. |

### Decision
**Select Option C (Native API Integration)**.
This aligns with the "Superpowers" philosophy of building premium, high-agency tools. It allows us to inject "Superpowers" (direct installation) into the search results, transforming a passive search into an active management tool.

---

## 2. Product Definition (Epistemology)

### Value Layer (Teleology)
-   **Purpose**: To empower users to discover and acquire new agentic capabilities (skills) without leaving their development environment.
-   **Value Proposition**: Drastically reduces the friction between "needing a skill" and "using a skill".

### Cognitive Layer (Ontology)
-   **Concepts**:
    -   **Global Search**: Searching the universe of available skills beyond the user's local context.
    -   **Skill Card**: A unit of discovery containing metadata (Name, Installs, Source).
    -   **Acquisition**: The act of pulling a skill from the global market into the local knife (library).

---

## 3. Specifications

### Functional Requirements
1.  **Search Bar**: A prominent search input in the Market Webview.
2.  **Live Search**: Results update as the user types (debounced).
3.  **Result Display**: Show a list of skills matching the query.
    -   Display: Name, Description (if available), Install Count, Source.
4.  **Actionability**: Each result must have an "Install" button or "View Details" action.

### Non-Functional Requirements
1.  **Performance**: Debounce API calls (e.g., 300ms) to avoid rate limiting.
2.  **Aesthetics**: Use VS Code native colors (`--vscode-*`) to ensure seamless theming.
3.  **Resilience**: distinct error states for offline/API failure.

---

## 4. UI/UX Design

### Layout
The Market Webview will be divided into two sections:
1.  **Header / Search Area**
    -   Large, "Hero" style search input.
    -   Placeholder: "Search the agent skill universe..."
    -   Icon: Magnifying glass (left), Clear button (right, appears when typing).

2.  **Results Area** (Dynamic)
    -   **State: Empty**: Show "Popular/Trending" or a "Quick Start" guide.
    -   **State: Loading**: Skeleton loaders or a subtle progress bar.
    -   **State: Results**: A grid or list of "Skill Cards".

### Skill Card Design (Premium)
-   **Container**: Card with subtle border and hover elevation.
-   **Top Row**:
    -   **Title**: Bold, primary text color.
    -   **Badge**: "Official" or "Verified" (if data allows), or Install count (e.g., "🔥 300+").
-   **Middle Row**:
    -   **Source**: `owner/repo` (muted text).
-   **Bottom Row**:
    -   **Action**: "Install" button (Primary color). When clicked, it should trigger the `skillKnife.install` command logic.

---

## 5. Implementation Plan

### Phase 1: Service Layer
1.  Create `src/services/skillShService.ts`.
2.  Implement `searchSkills(query: string): Promise<SkillResult[]>`.
3.  Define interfaces for the API response.

### Phase 2: Webview Enhancement
1.  Update the detailed implementation in the React/HTML content of the Webview.
2.  Add the Search Input component.
3.  Implement the "Debounce" logic for typing.
4.  Handle message passing: `webview` -> `postMessage({ command: 'search', text: '...' })` -> `extension`.

### Phase 3: Action Integration
1.  Handle the "Install" click.
2.  Resolve the `topSource` (e.g., `sickn33/antigravity-awesome-skills`) to a git URL.
3.  Invoke the existing `SkillManager` installation logic.

