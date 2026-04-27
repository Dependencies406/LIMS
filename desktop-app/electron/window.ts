/**
 * Window Management for Electron
 * Handles BrowserWindow creation and lifecycle
 */

import { BrowserWindow, BrowserWindowConstructorOptions } from 'electron'
import { join } from 'path'
import { isDev } from './main'
import log from 'electron-log'

let mainWindow: BrowserWindow | null = null

/**
 * Secure BrowserWindow configuration
 */
const WINDOW_OPTIONS: BrowserWindowConstructorOptions = {
  width: 1400,
  height: 900,
  minWidth: 1024,
  minHeight: 768,
  show: false, // Don't show until ready
  backgroundColor: '#ffffff',
  titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
  webPreferences: {
    // Security: Context isolation enabled
    contextIsolation: true,
    
    // Security: Node integration disabled
    nodeIntegration: false,
    
    // Security: Sandbox enabled
    sandbox: true,
    
    // Security: Web security enabled
    webSecurity: true,
    
    // Preload script (runs in isolated context)
    // In production, __dirname points to dist-electron/
    preload: join(__dirname, 'preload.js'),
    
    // Additional security
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
  },
}

/**
 * Create the main application window
 */
export function createWindow(): BrowserWindow {
  log.info('Creating main window...')

  mainWindow = new BrowserWindow(WINDOW_OPTIONS)

  // Prevent new window creation (modern API)
  mainWindow.webContents.setWindowOpenHandler(() => {
    log.warn('Blocked new window creation')
    return { action: 'deny' }
  })

  // Load the web app
  if (isDev) {
    // Development: Load from Vite dev server
    log.info('Loading from dev server: http://localhost:5173')
    mainWindow.loadURL('http://localhost:5173').catch((err) => {
      log.error('Failed to load dev server:', err)
    })
  } else {
    // Production: Load from built files
    const indexPath = join(__dirname, '../../dist/index.html')
    log.info('Loading from production build:', indexPath)
    mainWindow.loadFile(indexPath).catch((err) => {
      log.error('Failed to load production build:', err)
    })
  }

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show()
      log.info('Main window shown')
      
      // Focus window
      if (isDev) {
        mainWindow.webContents.openDevTools()
      }
    }
  })

  // Handle window closed
  mainWindow.on('closed', () => {
    log.info('Main window closed')
    mainWindow = null
  })

  // Handle window errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    log.error(`Window failed to load: ${errorCode} - ${errorDescription}`)
  })

  // Prevent navigation to external URLs (handled by security.ts, but double-check here)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isDev && url.startsWith('http://localhost:5173')) {
      return // Allow Vite HMR
    }
    if (!isDev && url.startsWith('file://')) {
      return // Allow file:// in production
    }
    event.preventDefault()
    log.warn(`Prevented navigation to: ${url}`)
  })

  return mainWindow
}

/**
 * Get the main window instance
 */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

/**
 * Close the main window
 */
export function closeWindow(): void {
  if (mainWindow) {
    mainWindow.close()
  }
}

/**
 * Reload the main window
 */
export function reloadWindow(): void {
  if (mainWindow) {
    mainWindow.reload()
  }
}
