/**
 * IPC Handlers for Electron
 * Handles communication between main process and renderer
 */

import { ipcMain, dialog, app } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { createConnection } from 'net'
import log from 'electron-log'
import { getMainWindow } from './window'

/**
 * Initialize all IPC handlers
 */
export function initializeIpcHandlers(): void {
  log.info('Initializing IPC handlers...')

  // Get app version
  ipcMain.handle('desktop:getAppVersion', () => {
    return app.getVersion()
  })

  // Check if running in desktop mode
  ipcMain.handle('desktop:isDesktop', () => {
    return true
  })

  // Get network status
  ipcMain.handle('desktop:getNetworkStatus', async () => {
    try {
      // Simple network check - try to connect to a reliable host
      return new Promise<boolean>((resolve) => {
        const socket = createConnection({ host: 'www.google.com', port: 80 }, () => {
          socket.destroy()
          resolve(true)
        })
        socket.setTimeout(2000)
        socket.once('timeout', () => {
          socket.destroy()
          resolve(false)
        })
        socket.once('error', () => {
          resolve(false)
        })
      })
    } catch {
      return false
    }
  })

  // Save file dialog
  ipcMain.handle('desktop:saveFile', async (_, data: { content: string; defaultFilename?: string; filters?: Array<{ name: string; extensions: string[] }> }) => {
    try {
      const window = getMainWindow()
      if (!window) {
        throw new Error('Main window not available')
      }

      const result = await dialog.showSaveDialog(window, {
        title: 'Save File',
        defaultPath: data.defaultFilename || 'untitled.txt',
        filters: data.filters || [
          { name: 'All Files', extensions: ['*'] },
        ],
      })

      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true }
      }

      await writeFile(result.filePath, data.content, 'utf-8')
      log.info(`File saved: ${result.filePath}`)
      
      return { success: true, filePath: result.filePath }
    } catch (error) {
      log.error('Error saving file:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // Open file dialog
  ipcMain.handle('desktop:openFile', async (_, options?: { filters?: Array<{ name: string; extensions: string[] }>; multiSelections?: boolean }) => {
    try {
      const window = getMainWindow()
      if (!window) {
        throw new Error('Main window not available')
      }

      const result = await dialog.showOpenDialog(window, {
        title: 'Open File',
        properties: options?.multiSelections ? ['openFile', 'multiSelections'] : ['openFile'],
        filters: options?.filters || [
          { name: 'All Files', extensions: ['*'] },
        ],
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true }
      }

      // Read all selected files
      const files = await Promise.all(
        result.filePaths.map(async (filePath) => {
          const content = await readFile(filePath, 'utf-8')
          return {
            path: filePath,
            name: filePath.split(/[/\\]/).pop() || 'unknown',
            content,
          }
        })
      )

      log.info(`Opened ${files.length} file(s)`)
      
      return { success: true, files }
    } catch (error) {
      log.error('Error opening file:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  log.info('IPC handlers initialized')
}

/**
 * Cleanup IPC handlers (for testing/cleanup)
 */
export function cleanupIpcHandlers(): void {
  ipcMain.removeAllListeners('desktop:getAppVersion')
  ipcMain.removeAllListeners('desktop:isDesktop')
  ipcMain.removeAllListeners('desktop:getNetworkStatus')
  ipcMain.removeAllListeners('desktop:saveFile')
  ipcMain.removeAllListeners('desktop:openFile')
}
