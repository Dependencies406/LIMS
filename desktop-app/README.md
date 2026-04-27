# LIMS Desktop Application

Production-ready Electron desktop wrapper for the LIMS web application.

## 🏗️ Architecture

This desktop app is a **completely isolated** Electron wrapper that loads the web app without modifying any web app source code. The architecture follows security-first principles:

- **Context Isolation**: Web content runs in isolated context
- **No Node Integration**: Web app cannot access Node.js APIs directly
- **Sandboxed**: Renderer process runs in sandbox mode
- **Preload Bridge**: Limited API exposed via `window.desktop`
- **Secure Navigation**: Only allowed origins can be loaded
- **CSP Enforcement**: Content Security Policy applied to all web content

## 📁 Project Structure

```
desktop-app/
├── electron/
│   ├── main.ts          # Main Electron process
│   ├── preload.ts       # Preload script (secure bridge)
│   ├── ipc.ts           # IPC handlers
│   ├── security.ts      # Security configuration
│   └── window.ts        # Window management
├── package.json
├── tsconfig.json
├── vite.electron.config.ts
└── README.md
```

## 🔒 Security Features

✅ **Context Isolation**: Enabled  
✅ **Node Integration**: Disabled  
✅ **Sandbox**: Enabled  
✅ **Remote Module**: Disabled  
✅ **Content Security Policy**: Enforced  
✅ **Navigation Restrictions**: Only allowed origins  
✅ **No Direct Filesystem Access**: All via IPC only  

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- The web app must be built or running in dev mode

### Installation

1. Navigate to the desktop app directory:
   ```bash
   cd desktop-app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Development

**Option 1: Run with web app dev server (Recommended)**

1. In the root directory, start the web app dev server:
   ```bash
   npm run dev
   ```

2. In another terminal, from `desktop-app/`, start Electron:
   ```bash
   npm run start:dev
   ```

   This will wait for the dev server to be ready, then launch Electron.

**Option 2: Manual start**

1. Start web app dev server (from root directory):
   ```bash
   cd ..
   npm run dev
   ```

2. In another terminal, build and start Electron (from desktop-app directory):
   ```bash
   cd desktop-app
   npm run build:electron
   npm start
   ```

### Building

#### Build Electron Main Process

```bash
npm run build:electron
```

#### Build Web App (from root directory)

```bash
cd ..
npm run build
```

#### Build Everything

```bash
# From desktop-app directory
npm run build:all
```

This builds both the Electron main process and the web app.

### Running Production Build

1. Ensure both Electron and web app are built:
   ```bash
   npm run build:all
   ```

2. Start Electron:
   ```bash
   npm start
   ```

## 📦 Packaging

### Package for Windows

```bash
npm run package:win
```

### Package for macOS

```bash
npm run package:mac
```

### Package for Linux

```bash
npm run package:linux
```

### Package for All Platforms

```bash
npm run package
```

Packaged applications will be in the `release/` directory.

## 🖥️ Desktop API

The web app can access desktop features via `window.desktop` (only available in Electron):

```typescript
// Check if running in desktop mode
if (window.desktop) {
  const isDesktop = window.desktop.isDesktop // true
  
  // Get app version
  const version = await window.desktop.getAppVersion()
  
  // Check network status
  const isOnline = await window.desktop.getNetworkStatus()
  
  // Save file
  const result = await window.desktop.saveFile({
    content: 'File content',
    defaultFilename: 'document.txt',
    filters: [
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  
  // Open file
  const result = await window.desktop.openFile({
    filters: [
      { name: 'Text Files', extensions: ['txt'] }
    ],
    multiSelections: false
  })
}
```

## 🔧 Configuration

### Development vs Production

- **Development**: Loads web app from `http://localhost:5173`
- **Production**: Loads web app from `../dist/index.html`

The mode is automatically detected based on `NODE_ENV` and `app.isPackaged`.

### Allowed Origins

Navigation is restricted to:
- `http://localhost:5173` (dev server)
- `http://127.0.0.1:5173` (dev server alternative)
- `file://` (production build)

All other origins are blocked.

## 🐛 Troubleshooting

### Web app not loading

1. **Development**: Ensure the web app dev server is running on port 5173
2. **Production**: Ensure the web app is built (`npm run build` from root)
3. Check console logs in Electron DevTools (press F12 in dev mode)

### IPC not working

- Ensure `window.desktop` exists before calling methods
- Check Electron console for errors
- Verify preload script is loaded (check DevTools console)

### Build errors

- Ensure TypeScript is installed: `npm install -g typescript`
- Clear build cache: Delete `dist-electron/` folder
- Rebuild: `npm run build:electron`

## ✅ Verification Checklist

Before deploying, verify:

- [ ] Web app builds and runs unchanged
- [ ] Desktop app launches and displays web app
- [ ] Desktop APIs work when `window.desktop` exists
- [ ] Removing `desktop-app/` does not break web app
- [ ] Security settings are enforced (check DevTools)
- [ ] Navigation restrictions work (try external URLs)
- [ ] File save/open dialogs work
- [ ] Network status detection works

## 🔐 Security Checklist

- [x] Context isolation enabled
- [x] Node integration disabled
- [x] Sandbox enabled
- [x] Remote module disabled
- [x] Content Security Policy enforced
- [x] Navigation restricted to allowed origins
- [x] No direct filesystem access from renderer
- [x] All Electron APIs via IPC only
- [x] Preload script isolated from web content

## 📝 Notes

- The desktop app is **completely isolated** from the web app
- No web app source code is modified
- The web app can be removed/updated independently
- Desktop features are opt-in via `window.desktop` checks
- All security best practices are enforced

## 🚫 What NOT to Do

- ❌ Don't edit web app files
- ❌ Don't add Electron imports to web code
- ❌ Don't duplicate business logic
- ❌ Don't store unencrypted sensitive data
- ❌ Don't bypass security settings
- ❌ Don't expose Node.js APIs directly

## 📄 License

Same as the main LIMS project.
