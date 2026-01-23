# SkillKnife

A VSCode extension to browse and manage AI agent skills installed on your system.

## Features

- **Sidebar View**: See all installed skills at a glance with location tags
- **Skill Details**: Click any skill to view its full documentation
- **Market Browsing**: Browse skills from configured git repositories
- **Skill Installation**: Install skills to project or global scope with reader selection
- **Update Detection**: See which skills have updates available
- **Delete Skills**: Remove skills via context menu
- **Search & Filter**: Filter skills by name or description in sidebar and market
- **Multi-Reader Support**: Works with Claude Code, Codex, Gemini CLI, Antigravity, and more
- **Configurable**: Add custom readers and markets via settings

## Usage

1. Open the SkillKnife view from the activity bar
2. Click any skill to see its details
3. Click "Markets" to browse available skills
4. Use the search icon to filter skills in sidebar
5. Use the search box in market panel to find skills
6. Right-click a skill to delete it
7. Use the refresh button to rescan skills

## Configuration

### Custom Readers

Add custom readers in `settings.json`:

```json
{
  "skillKnife.readers": [
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
  "skillKnife.markets": [
    {
      "name": "My Skills",
      "git": "myorg/my-skills"
    }
  ]
}
```
