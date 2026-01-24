# SkillKnife - AI Agent Skills Manager for VS Code

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/visual-studio-marketplace/v/antigravity.skill-knife)](https://marketplace.visualstudio.com/items?itemName=antigravity.skill-knife)

**SkillKnife** is a powerful VS Code extension for managing AI Agent Skills (MCP). It allows you to discover, install, update, and organize skills for agents like Claude Code, Wind, and Superpowers.

## Features

### 📦 Skill Markets
Access a curated list of skill repositories including:
- **Anthropic Official**
- **Superpowers**
- **Vercel Labs**
- **ComposioHQ**
- **Custom Markets**: distinctively marked with `*` and fully manageable (Add/Delete via Git URL).

### 🔄 Multi-Strategy Profile Management
Save and switch between skill sets easily:
- **Save Profile**: Snapshot your current project skills.
- **Load Profile (Sync Mode)**: Enforce a profile by installing missing skills and **removing** extras to ensure an exact environmental match.

### 🛡️ Scope Control
Manage skills across different scopes with visual indicators:
- `(P)` **Project**: Local to your workspace (`.claude/skills` or `.agent/skills`).
- `(G)` **Global**: System-wide availability.

### ⚡ Batch Operations
- **Install All / Uninstall All**: One-click bulk management from the Market Panel.
- **Update All**: Keep everything fresh with a single command.

## Usage

1. **Open the View**: Click the "Skills" icon in your Explorer or run `SkillKnife: Show Markets`.
2. **Find Skills**: Use the search bar in the Market Panel.
3. **Manage**: Click "Install" to add a skill. Use the dropdown to switch markets.
4. **Profiles**: Use `Cmd+Shift+P` -> `SkillKnife: Save Profile` / `Load Profile`.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to get started.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
