# Skill Manager UI Updates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance the Skill Manager UI with an "Update All" capability in the view title and an "Install All" feature in the Markets webview.

**Architecture:** 
1.  **View Title Update:** Register a new command `skillManager.updateAll` command and add it to the `view/title` menu group in `package.json`. Implement the handler in `extension.ts` using `updateService`.
2.  **Webview Install All:** Add an "Install All" button to the `MarketPanel` HTML. Handle the 'installAll' message in `_handleMessage`, iterating through filtered skills and triggering the install process.

**Tech Stack:** TypeScript, VS Code Extension API, HTML/CSS (Webview).

---

### Task 1: Add "Update" Button to View Title

**Files:**
- Modify: `package.json` (add command, menu item)
- Modify: `src/extension.ts` (register command)
- Modify: `src/services/updateService.ts` (export update logic if needed - *check if batch update is supported*)

**Step 1: Check update service capabilities**

Check if `src/services/updateService.ts` supports updating all skills. If not, we might need to iterate.

**Step 2: Add command to package.json**

- Add `skillManager.updateAll` to `commands`.
- Add to `menus` > `view/title` with icon `$(cloud-download)` or similar.

**Step 3: Implement command handler in extension.ts**

```typescript
// src/extension.ts
const updateAllCmd = vscode.commands.registerCommand('skillManager.updateAll', async () => {
    // Logic to find all updatable skills and update them
    // Re-use existing update logic or create batch function
});
context.subscriptions.push(updateAllCmd);
```

**Step 4: Commit**

```bash
git add package.json src/extension.ts
git commit -m "feat: add update all button to view title"
```

---

### Task 2: Add "Install All" Button to Market Webview

**Files:**
- Modify: `src/views/marketPanel.ts`

**Step 1: Add "Install All" button to HTML**

Update `_getHtmlContent` in `src/views/marketPanel.ts` to include `<button onclick="installAll()">Install All</button>` in the `.controls` div.

**Step 2: Add script handler**

Add `installAll` function to the script section in existing HTML string:

```javascript
function installAll() {
  vscode.postMessage({ command: 'installAll' });
}
```

**Step 3: Handle message in _handleMessage**

Update `_handleMessage` switch case:

```typescript
case 'installAll':
    // Get all currently visible/filtered skills that are NOT installed
    // Loop and install specific ones
    await this._installAllVisible();
    break;
```

*Note: We need to implement `_installAllVisible` or similar logic to grab the list from `_skills` (respecting filters if desired, or just all in market).*

**Step 4: Commit**

```bash
git add src/views/marketPanel.ts
git commit -m "feat: add install all button to market webview"
```
