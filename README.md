# SkillManager

A VSCode extension to browse and manage AI agent skills installed on your system.

## Features

- **Sidebar View**: See all installed skills at a glance with location tags
- **Skill Details**: Click any skill to view its full documentation
- **Market Browsing**: Browse skills from configured git repositories
- **Skill Installation**: Install skills to project or global scope with reader selection
- **Multi-Reader Support**: Works with Claude Code, Codex, Gemini CLI, Antigravity, and more
- **Configurable**: Add custom readers and markets via settings

## Usage

1. Open the SkillManager view from the activity bar
2. Click any skill to see its details
3. Click "Markets" to browse available skills
4. Use the refresh button to rescan skills

## Configuration

### Custom Readers

Add custom readers in `settings.json`:

```json
{
  "skillManager.readers": [
    {
      "id": "my-agent",
      "name": "My Agent",
      "shortName": "MA",
      "globalPath": "~/.myagent/skills",
      "projectPath": ".myagent/skills"
    }
  ]
}
```

### Custom Markets

Add custom skill markets:

```json
{
  "skillManager.markets": [
    {
      "name": "My Skills",
      "git": "myorg/my-skills"
    }
  ]
}
```

## Roadmap

- **Milestone 3**: Update detection and batch operations
