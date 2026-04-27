# Desktop App Architecture

## Overview

The desktop app is a **completely isolated** Electron wrapper that loads the web application without modifying any web app source code. This ensures:

- ✅ Web app remains unchanged and independent
- ✅ Desktop app can be removed without affecting web app
- ✅ Security-first architecture with strict isolation
- ✅ No code duplication or logic refactoring

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Electron Main Process                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  main.ts     │  │  window.ts   │  │  security.ts │ │
│  │  (Entry)     │→ │  (Window     │  │  (CSP,       │ │
│  │              │  │   Mgmt)      │  │   Navigation)│ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│         │                  │                  │         │
│         └──────────────────┼──────────────────┘         │
│                            │                            │
│                    ┌───────▼───────┐                    │
│                    │    ipc.ts     │                    │
│                    │  (IPC Handlers)│                    │
│                    └───────┬───────┘                    │
└────────────────────────────┼────────────────────────────┘
                             │ IPC
                             │
┌────────────────────────────▼────────────────────────────┐
│              Preload Script (Isolated Context)          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  preload.ts                                       │  │
│  │  - Exposes window.desktop API                    │  │
│  │  - Context bridge only                            │  │
│  │  - No Node.js access                              │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────┘
                             │ contextBridge
                             │
┌────────────────────────────▼────────────────────────────┐
│              Web App (Renderer Process)                │
│  ┌──────────────────────────────────────────────────┐  │
│  │  React + Firebase + Spreadsheet                  │  │
│  │  - Unchanged web app code                        │  │
│  │  - Optional: window.desktop API                  │  │
│  │  - Runs in sandbox                               │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Security Layers

### 1. Context Isolation
- Web content runs in isolated JavaScript context
- Cannot access Node.js APIs directly
- Cannot access Electron APIs directly

### 2. Sandbox
- Renderer process runs in sandbox mode
- Limited system access
- OS-level isolation

### 3. Preload Bridge
- Only `window.desktop` API exposed
- Strict API surface (5 methods only)
- All operations via IPC

### 4. Content Security Policy
- Enforced on all web content
- Restricts script sources
- Prevents inline script execution (with exceptions for Vite)

### 5. Navigation Restrictions
- Only allowed origins can be loaded
- External URLs blocked
- File:// protocol restricted to app directory

## Data Flow

### Desktop API Call Flow

```
Web App (Renderer)
    ↓
window.desktop.saveFile({...})
    ↓
Preload Script (contextBridge)
    ↓
IPC: desktop:saveFile
    ↓
Main Process (ipc.ts)
    ↓
Native Dialog (Electron)
    ↓
File System (Node.js)
    ↓
Response via IPC
    ↓
Preload Script
    ↓
Web App (Promise resolves)
```

## File Structure

```
desktop-app/
├── electron/
│   ├── main.ts          # Entry point, app lifecycle
│   ├── preload.ts       # Secure bridge to renderer
│   ├── ipc.ts           # IPC handlers (file ops, etc.)
│   ├── security.ts      # CSP, navigation restrictions
│   └── window.ts        # BrowserWindow management
├── package.json         # Dependencies, scripts
├── tsconfig.json        # TypeScript config (CommonJS)
└── README.md            # Usage instructions
```

## Development vs Production

### Development Mode
- Loads from: `http://localhost:5173`
- DevTools: Auto-opened
- Hot Reload: Via Vite HMR
- Logging: Verbose

### Production Mode
- Loads from: `../dist/index.html` (file://)
- DevTools: Closed
- Hot Reload: Disabled
- Logging: Info level only

## Desktop API Reference

### `window.desktop.isDesktop`
- Type: `boolean`
- Always: `true` (only exists in Electron)

### `window.desktop.getAppVersion()`
- Returns: `Promise<string>`
- Gets Electron app version

### `window.desktop.getNetworkStatus()`
- Returns: `Promise<boolean>`
- Checks internet connectivity

### `window.desktop.saveFile(data)`
- Parameters:
  - `content: string` - File content
  - `defaultFilename?: string` - Suggested filename
  - `filters?: Array<{name, extensions}>` - File type filters
- Returns: `Promise<{success, filePath?, canceled?, error?}>`

### `window.desktop.openFile(options?)`
- Parameters:
  - `filters?: Array<{name, extensions}>` - File type filters
  - `multiSelections?: boolean` - Allow multiple files
- Returns: `Promise<{success, files?, canceled?, error?}>`

## Security Checklist

- [x] Context isolation enabled
- [x] Node integration disabled
- [x] Sandbox enabled
- [x] Remote module disabled
- [x] Web security enabled
- [x] CSP enforced
- [x] Navigation restricted
- [x] No direct filesystem access
- [x] All APIs via IPC
- [x] Preload isolated from web content

## Isolation Guarantees

1. **No Web App Modifications**: Zero changes to web app source
2. **No Shared Dependencies**: Desktop app has separate node_modules
3. **No Code Injection**: Web app loads as-is
4. **Optional API**: `window.desktop` only exists in Electron
5. **Removable**: Delete `desktop-app/` folder, web app unaffected

## Build Process

1. **TypeScript Compilation**: `tsc` compiles Electron code to CommonJS
2. **Web App Build**: Vite builds web app (separate process)
3. **Electron Packaging**: electron-builder packages everything
4. **Output**: Standalone executable with embedded web app

## Future Enhancements (Not Implemented)

- Auto-updater integration
- Encrypted local storage
- OS keychain integration
- Native notifications
- System tray integration
- Custom protocol handlers

These can be added without modifying web app code.
