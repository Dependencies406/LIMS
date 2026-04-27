import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { NotificationBell } from './NotificationBell';
import { getNavSectionFromRoute } from '../utils/pageHeaderFromRoute';

/** App mark when the route has no section emoji (fallback). */
const LimsDatabaseIcon: React.FC<{ className?: string }> = ({ className = 'w-9 h-9' }) => (
  <div className={`flex-shrink-0 ${className}`} aria-hidden>
    <svg viewBox="0 0 64 64" className="w-full h-full">
      <defs>
        <linearGradient id="lims-cap" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#cfe1fb" />
          <stop offset="100%" stopColor="#a9c5f2" />
        </linearGradient>
        <linearGradient id="lims-body" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5a97e8" />
          <stop offset="100%" stopColor="#2b77d2" />
        </linearGradient>
        <linearGradient id="lims-rim" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#0a6ac7" />
          <stop offset="100%" stopColor="#0a5fb3" />
        </linearGradient>
      </defs>

      <ellipse cx="32" cy="14" rx="26" ry="12" fill="url(#lims-body)" />
      <ellipse cx="28" cy="11.5" rx="22" ry="9.8" fill="url(#lims-cap)" />
      <path d="M6 14c0 6.6 11.6 12 26 12s26-5.4 26-12v34c0 6.6-11.6 12-26 12S6 54.6 6 48V14z" fill="url(#lims-body)" />
      <path d="M6 27c0 6.2 11.6 11.3 26 11.3S58 33.2 58 27v5c0 6.2-11.6 11.3-26 11.3S6 38.2 6 32v-5z" fill="url(#lims-rim)" />
      <path d="M6 41c0 6.2 11.6 11.3 26 11.3S58 47.2 58 41v5c0 6.2-11.6 11.3-26 11.3S6 52.2 6 46v-5z" fill="url(#lims-rim)" />
      <rect x="13" y="21" width="18" height="4.8" rx="2.4" fill="#0f6dcc" opacity="0.95" />
      <rect x="13" y="35" width="18" height="4.8" rx="2.4" fill="#0f6dcc" opacity="0.95" />
      <rect x="13" y="49" width="18" height="4.8" rx="2.4" fill="#0f6dcc" opacity="0.95" />
      <circle cx="46.8" cy="24.5" r="2.2" fill="#ffd45a" />
      <circle cx="52.2" cy="22.8" r="2.2" fill="#ff7a3a" />
      <circle cx="47.8" cy="38.7" r="2.2" fill="#ff7a3a" />
      <circle cx="52.8" cy="40.8" r="2.2" fill="#ffd45a" />
      <circle cx="48.8" cy="53.2" r="2.2" fill="#ffd45a" />
      <circle cx="53.2" cy="51.0" r="2.2" fill="#ff7a3a" />
    </svg>
  </div>
);

export const Layout: React.FC = () => {
  const { currentUser, logout, isAdmin } = useAuth();
  const { success, error: showError } = useToast();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleLogout = async () => {
    try {
      await logout();
      success('Logged out successfully');
    } catch (err) {
      showError('Failed to logout');
    }
  };

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(`${path}/`);

  const navLinkClass = (path: string) =>
    `flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors whitespace-nowrap ${
      isActive(path)
        ? 'bg-primary-100 text-primary-700 font-semibold'
        : 'text-gray-700 hover:bg-gray-100'
    }`;

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!menuOpen) return;
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [menuOpen]);

  const navSection = getNavSectionFromRoute(location.pathname);
  const isAppFallback = navSection.label === 'LIMS' && !navSection.iconEmoji;

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <header className="relative z-40 bg-white shadow-sm border-b border-gray-200">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="min-h-16 py-2 flex items-center justify-between gap-3 sm:gap-4">
            <div className="relative min-w-0 flex-shrink-0" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 min-w-0 max-w-full"
                aria-expanded={menuOpen}
                aria-haspopup="true"
                title="Open menu"
              >
                {navSection.iconEmoji ? (
                  <span className="text-xl leading-none flex-shrink-0" aria-hidden>
                    {navSection.iconEmoji}
                  </span>
                ) : (
                  <LimsDatabaseIcon className="w-8 h-8 sm:w-9 sm:h-9" />
                )}
                <span
                  className={`text-base sm:text-lg font-bold leading-none truncate ${
                    isAppFallback ? 'text-[#c73636]' : 'text-gray-900'
                  }`}
                >
                  {navSection.label}
                </span>
                <svg
                  className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {menuOpen && (
                <div className="absolute left-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
                  <div className="p-2">
                    <Link to="/pending-jobs" className={navLinkClass('/pending-jobs')}>
                      <span>⏳</span>
                      <span>Pending Requests</span>
                    </Link>
                    <Link to="/jobs" className={navLinkClass('/jobs')}>
                      <span>📋</span>
                      <span>Jobs</span>
                    </Link>
                    <Link to="/customers" className={navLinkClass('/customers')}>
                      <span>👥</span>
                      <span>Customers</span>
                    </Link>
                    <Link to="/staff-performance" className={navLinkClass('/staff-performance')}>
                      <span>📊</span>
                      <span>Staff Performance</span>
                    </Link>
                    <Link to="/documents" className={navLinkClass('/documents')}>
                      <span>📚</span>
                      <span>Documents</span>
                    </Link>
                    <Link to="/recycle-bin" className={navLinkClass('/recycle-bin')}>
                      <span>🗑️</span>
                      <span>Recycle Bin</span>
                    </Link>
                    {isAdmin && (
                      <Link to="/settings" className={navLinkClass('/settings')}>
                        <span>⚙️</span>
                        <span>Settings</span>
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 flex-shrink-0">
              <NotificationBell />

              <div className="hidden sm:flex items-center gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-primary-700 font-semibold">
                      {currentUser?.email?.[0].toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{currentUser?.email}</div>
                    <div className="text-xs text-gray-500 capitalize truncate">{currentUser?.role || 'User'}</div>
                  </div>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="flex items-center justify-center w-10 h-10 rounded-lg border border-gray-300 bg-white hover:bg-red-50 transition-all duration-200 hover:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                title="Logout"
              >
                <svg className="w-4 h-4 text-gray-600 hover:text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
};
