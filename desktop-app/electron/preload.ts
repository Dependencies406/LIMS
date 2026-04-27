/**
 * Preload Script for Electron
 * Provides secure bridge between main process and renderer
 * 
 * This script runs in an isolated context before the web page loads.
 * It exposes a limited API to the renderer process via window.desktop
 */

import { contextBridge, ipcRenderer } from 'electron'

/**
 * Desktop API interface
 * Only these methods are exposed to the web app
 */
const desktopAPI = {
  /**
   * Check if running in desktop mode
   */
  isDesktop: true,

  /**
   * Get application version
   */
  getAppVersion: (): Promise<string> => {
    return ipcRenderer.invoke('desktop:getAppVersion')
  },

  /**
   * Get network connectivity status
   */
  getNetworkStatus: (): Promise<boolean> => {
    return ipcRenderer.invoke('desktop:getNetworkStatus')
  },

  /**
   * Save file using native dialog
   * @param data - File data to save
   * @returns Promise with save result
   */
  saveFile: (data: {
    content: string
    defaultFilename?: string
    filters?: Array<{ name: string; extensions: string[] }>
  }): Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }> => {
    return ipcRenderer.invoke('desktop:saveFile', data)
  },

  /**
   * Open file using native dialog
   * @param options - File dialog options
   * @returns Promise with file data
   */
  openFile: (options?: {
    filters?: Array<{ name: string; extensions: string[] }>
    multiSelections?: boolean
  }): Promise<{
    success: boolean
    files?: Array<{ path: string; name: string; content: string }>
    canceled?: boolean
    error?: string
  }> => {
    return ipcRenderer.invoke('desktop:openFile', options)
  },
}

/**
 * Expose protected API to renderer process
 * This is the ONLY way the web app can access Electron features
 */
contextBridge.exposeInMainWorld('desktop', desktopAPI)

/**
 * Type declaration for TypeScript (will be available in renderer if types are shared)
 * This is just for documentation - actual types should be in a shared types file if needed
 */
declare global {
  interface Window {
    desktop: typeof desktopAPI
  }
}
