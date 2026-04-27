/**
 * Security Configuration for Electron
 * Enforces strict security policies and content security
 */

import { app, session } from 'electron'
import log from 'electron-log'

/**
 * Content Security Policy for web content
 */
export const CSP_HEADER = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval' https://fonts.googleapis.com https://fonts.gstatic.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: https:;
  connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://*.google.com wss://*.firebaseio.com;
  frame-src 'none';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  upgrade-insecure-requests;
`.replace(/\s+/g, ' ').trim()

/**
 * Allowed origins for navigation
 */
export const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'file://',
]

/**
 * Configure security settings for Electron session
 */
export function configureSecurity(): void {
  log.info('Configuring Electron security settings...')

  // Set Content Security Policy
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP_HEADER],
        'X-Content-Type-Options': ['nosniff'],
        'X-Frame-Options': ['DENY'],
        'X-XSS-Protection': ['1; mode=block'],
      },
    })
  })

  // Block navigation to disallowed origins
  session.defaultSession.webRequest.onBeforeRequest(
    {
      urls: ['<all_urls>'],
    },
    (details, callback) => {
      const url = new URL(details.url)
      const origin = `${url.protocol}//${url.host}${url.port ? `:${url.port}` : ''}`

      // Allow file:// protocol and localhost in dev
      if (url.protocol === 'file:') {
        callback({})
        return
      }

      // Check if origin is allowed
      const isAllowed = ALLOWED_ORIGINS.some((allowed) => {
        if (allowed === 'file://') return false
        return origin.startsWith(allowed)
      })

      if (!isAllowed && url.protocol !== 'https:') {
        log.warn(`Blocked navigation to disallowed origin: ${origin}`)
        callback({ cancel: true })
        return
      }

      callback({})
    }
  )

  // Prevent navigation to external URLs from web content
  app.on('web-contents-created', (_, contents) => {
    // Prevent navigation to external URLs
    contents.on('will-navigate', (event: Electron.Event, navigationUrl: string) => {
      const parsedUrl = new URL(navigationUrl)
      const origin = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.port ? `:${parsedUrl.port}` : ''}`

      // Allow file:// and localhost
      if (parsedUrl.protocol === 'file:') {
        return
      }

      const isAllowed = ALLOWED_ORIGINS.some((allowed) => {
        if (allowed === 'file://') return false
        return origin.startsWith(allowed)
      })

      if (!isAllowed) {
        event.preventDefault()
        log.warn(`Blocked navigation to: ${navigationUrl}`)
      }
    })
  })

  log.info('Security settings configured successfully')
}

/**
 * Check if URL is safe to load
 */
export function isSafeOrigin(url: string): boolean {
  try {
    const parsed = new URL(url)
    
    if (parsed.protocol === 'file:') {
      return true
    }

    return ALLOWED_ORIGINS.some((allowed) => {
      if (allowed === 'file://') return false
      return url.startsWith(allowed)
    })
  } catch {
    return false
  }
}
