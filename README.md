# Terminal Manager

An Electron desktop app for managing multiple Claude Code and GitHub Copilot terminal sessions in a single window.

## Features

- **Multiple Sessions**: Run Claude Code and GitHub Copilot sessions side-by-side with tabs
- **Session Metadata**: View model, context usage, git branch, working directory, and current task at a glance
- **Session Persistence**: Sessions are saved and automatically restored on app restart
- **Resume Conversations**: Claude sessions restart with `--continue` to resume the last conversation
- **Import Sessions**: Import existing Claude sessions from `~/.claude/history.jsonl`
- **Inactive Sessions**: Closed sessions remain in the sidebar and can be restarted with a click
- **Keyboard Shortcuts**: Full keyboard navigation support

## Installation

```bash
# Clone the repository
git clone https://github.com/coneilen/terminal-manager.git
cd terminal-manager

# Install dependencies
npm install

# Rebuild native modules for Electron
npx electron-rebuild

# Start in development mode
npm run dev
```

## Usage

### Creating Sessions

1. Press **F2** or click **New Session** in the sidebar
2. Select session type (Claude Code or GitHub Copilot)
3. Choose working directory using the folder picker
4. Click **Create Session**

### Importing Claude Sessions

1. Click **Import Claude** in the sidebar
2. Browse existing sessions from your Claude history
3. Click **Import** to add a session (starts with `--continue`)

### Bulk Load from JSON

Create multiple sessions at once from a JSON config file:

1. Click **Load from JSON** in the sidebar
2. Select your JSON file

**JSON format:**
```json
{
  "sessions": [
    {
      "type": "claude",
      "folder": "~/projects/my-app",
      "name": "my-app"
    },
    {
      "type": "copilot",
      "folder": "~/projects/frontend"
    }
  ]
}
```

- `type`: `"claude"` or `"copilot"`
- `folder`: Working directory (supports `~` for home)
- `name`: Optional session name

### Managing Sessions

- **Switch tabs**: Click tab or use **Ctrl+1-9**
- **Close session**: **Ctrl+W** or click stop button (keeps in sidebar)
- **Remove session**: Click X button (permanently removes)
- **Restart inactive session**: Click on dimmed session in sidebar

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| F1 | Toggle sidebar |
| F2 | New session dialog |
| F3 | Next tab |
| F4 | Previous tab |
| Ctrl+1-9 | Switch to tab N |
| Ctrl+W | Close current session |
| Ctrl+Q | Quit app |

## Development

```bash
# Start development server with hot reload
npm run dev

# Build for production
npm run build

# Package for distribution
npm run package
```

### Tech Stack

- **Framework**: Electron
- **Frontend**: Svelte + TypeScript
- **Terminal**: xterm.js + node-pty
- **Styling**: Tailwind CSS
- **Build**: electron-vite

### Project Structure

```
src/
├── main/                    # Electron main process
│   ├── index.ts             # App entry, window creation
│   ├── ipc.ts               # IPC handlers
│   └── session/
│       ├── manager.ts       # Session lifecycle
│       ├── pty.ts           # node-pty wrapper
│       ├── metadata.ts      # Output parsing
│       ├── persistence.ts   # Save/restore sessions
│       ├── importer.ts      # Import from ~/.claude
│       └── types.ts
├── preload/
│   └── index.ts             # IPC bridge
└── renderer/                # Svelte frontend
    ├── App.svelte
    ├── lib/
    │   ├── components/      # UI components
    │   ├── stores/          # Svelte stores
    │   └── utils/           # xterm.js setup
    └── styles/
        └── app.css
```

## Building for Distribution

```bash
# Build for macOS
npm run package:mac

# Build for Windows
npm run package:win

# Build for Linux
npm run package:linux
```

Packaged apps will be output to the `release/` directory.

## CI/CD

This project uses GitHub Actions for:
- **CI**: Builds and tests on every push/PR (Mac, Linux, Windows)
- **Release**: Automatically packages and creates GitHub releases when you push a version tag

To create a release:
```bash
git tag v1.0.0
git push origin v1.0.0
```

## License

MIT
