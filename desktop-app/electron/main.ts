/**
 * Electron Main Process
 * Entry point for the desktop application
 * 
 * This file initializes Electron and manages the application lifecycle.
 * It does NOT modify or interact with the web app code directly.
 */

import { app, BrowserWindow } from 'electron'
import { initializeIpcHandlers } from './ipc'
import { configureSecurity } from './security'
import { createWindow, getMainWindow } from './window'
import log from 'electron-log'

// Configure logging
log.transports.file.level = 'info'
log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info'

// Determine if running in development
export const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

/**
 * Initialize the Electron application
 */
function initializeApp(): void {
  log.info('Initializing Electron application...')
  log.info(`Environment: ${isDev ? 'Development' : 'Production'}`)
  log.info(`Platform: ${process.platform}`)
  log.info(`Electron version: ${process.versions.electron}`)
  log.info(`Node version: ${process.versions.node}`)

  // Initialize IPC handlers (can be done before app is ready)
  initializeIpcHandlers()

  // Handle app ready
  app.whenReady().then(() => {
    log.info('Application ready')
    
    // Configure security settings (must be after app is ready)
    configureSecurity()
    
    // Create main window
    createWindow()

    // macOS: Re-create window when dock icon is clicked
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })

  // Handle all windows closed
  app.on('window-all-closed', () => {
    log.info('All windows closed')
    // macOS: Keep app running even when all windows are closed
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  // Handle app before quit (graceful shutdown)
  app.on('before-quit', (event) => {
    log.info('Application shutting down...')
    const window = getMainWindow()
    if (window && !window.isDestroyed()) {
      // Allow window to close gracefully
      window.destroy()
    }
  })

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    log.error('Uncaught exception:', error)
    // In production, you might want to show an error dialog
    if (!isDev) {
      // Optionally show error to user
    }
  })

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    log.error('Unhandled rejection at:', promise, 'reason:', reason)
  })

  // Prevent new window creation (handled in window.ts via setWindowOpenHandler)
}

/**
 * Start the application
 */
initializeApp()
