import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../contexts/PermissionContext';
import { useToast } from '../hooks/useToast';
import { NotificationBell } from './NotificationBell';

// â”€â”€â”€ SVG Icon Components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Each icon is visually distinct so users can identify sections at a glance.

const PendingIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const JobsIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
    <line x1="12" y1="12" x2="12" y2="12.01" strokeWidth={3} />
    <path d="M2 12.5h20" />
  </svg>
);

const CustomersIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    {/* ID card */}
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <circle cx="8" cy="11" r="2" />
    <path d="M14 9h4M14 13h4M5.5 17a3.5 3.5 0 015-3.17" />
  </svg>
);

const EquipmentIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    {/* Wrench */}
    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
  </svg>
);

const StaffIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
    <circle cx="12" cy="7" r="4" />
    <path d="M16 3.13a4 4 0 010 7.75" />
  </svg>
);

const DocumentsIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const RecycleBinIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
  </svg>
);

const SettingsIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);

/** App logo mark — shown in header button when on a top-level page */
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

// â”€â”€â”€ Nav item definitions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface NavItem {
  path: string;
  label: string;
  Icon: React.FC<{ className?: string }>;
  /** Tailwind color class for the icon when active */
  activeColor: string;
  /** Tailwind bg class for the icon pill when active */
  activeBg: string;
  adminOnly?: boolean;
}

const PRIMARY_NAV: NavItem[] = [
  { path: '/pending-jobs', label: 'Pending Requests', Icon: PendingIcon,  activeColor: 'text-amber-600',  activeBg: 'bg-amber-50'  },
  { path: '/jobs',         label: 'Jobs',             Icon: JobsIcon,      activeColor: 'text-blue-600',   activeBg: 'bg-blue-50'   },
  { path: '/customers',   label: 'Customers',         Icon: CustomersIcon, activeColor: 'text-indigo-600', activeBg: 'bg-indigo-50' },
  { path: '/equipment',   label: 'Equipment',         Icon: EquipmentIcon, activeColor: 'text-emerald-600',activeBg: 'bg-emerald-50'},
  { path: '/staff',       label: 'Staff',             Icon: StaffIcon,     activeColor: 'text-violet-600', activeBg: 'bg-violet-50' },
];

const SECONDARY_NAV: NavItem[] = [
  { path: '/documents',   label: 'Documents',         Icon: DocumentsIcon, activeColor: 'text-slate-600',  activeBg: 'bg-slate-50'  },
  { path: '/recycle-bin', label: 'Recycle Bin',       Icon: RecycleBinIcon,activeColor: 'text-rose-600',   activeBg: 'bg-rose-50'   },
  { path: '/settings',   label: 'Settings',           Icon: SettingsIcon,  activeColor: 'text-gray-700',   activeBg: 'bg-gray-100', adminOnly: true },
];

// â”€â”€â”€ Helper: which icon/colour to display in the header button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getCurrentNavItem(pathname: string): NavItem | undefined {
  const all = [...PRIMARY_NAV, ...SECONDARY_NAV];
  return all.find(({ path }) => pathname === path || pathname.startsWith(`${path}/`));
}

function getCurrentSectionLabel(pathname: string): string {
  const item = getCurrentNavItem(pathname);
  if (item) return item.label;
  if (pathname.startsWith('/jobs')) return 'Jobs';
  if (pathname.startsWith('/equipment')) return 'Equipment';
  return 'LIMS';
}

// â”€â”€â”€ Layout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const Layout: React.FC = () => {
  const { currentUser, logout, isAdmin } = useAuth();
  const { can } = usePermissions();
  const { success, error: showError } = useToast();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleLogout = async () => {
    try {
      await logout();
      success('Logged out successfully');
    } catch {
      showError('Failed to logout');
    }
  };

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  // Close menu when navigating
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  // Close menu on outside click / Escape
  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (!menuOpen) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const currentItem = getCurrentNavItem(location.pathname);
  const sectionLabel = getCurrentSectionLabel(location.pathname);
  const isLimsFallback = sectionLabel === 'LIMS';

  // Filter secondary nav by permissions
  const visibleSecondary = SECONDARY_NAV.filter(({ adminOnly }) =>
    !adminOnly || isAdmin || can('settings.view')
  );

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* â”€â”€ Top Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <header className="relative z-40 bg-white shadow-sm border-b border-gray-200">
        <div className="px-3 sm:px-5 lg:px-8">
          <div className="h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">

            {/* â”€â”€ Nav Button (left) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <div className="relative min-w-0 flex-shrink-0" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-400 transition-colors"
                aria-expanded={menuOpen}
                aria-haspopup="true"
                title="Navigation menu"
              >
                {/* Current section icon */}
                {currentItem ? (
                  <span className={`flex-shrink-0 ${currentItem.activeColor}`}>
                    <currentItem.Icon className="w-6 h-6 sm:w-7 sm:h-7" />
                  </span>
                ) : (
                  <LimsDatabaseIcon className="w-7 h-7 sm:w-8 sm:h-8" />
                )}

                {/* Section label */}
                <span
                  className={`text-sm sm:text-base font-bold leading-none truncate max-w-[120px] sm:max-w-none ${
                    isLimsFallback ? 'text-[#c73636]' : 'text-gray-900'
                  }`}
                >
                  {sectionLabel}
                </span>

                {/* Chevron */}
                <svg
                  className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${menuOpen ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* â”€â”€ Dropdown Menu â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
              {menuOpen && (
                <div
                  className="absolute left-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden"
                  role="menu"
                >
                  {/* Primary section */}
                  <div className="p-2">
                    {PRIMARY_NAV.map(({ path, label, Icon, activeColor, activeBg }) => {
                      const active = isActive(path);
                      return (
                        <Link
                          key={path}
                          to={path}
                          role="menuitem"
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                            active
                              ? `${activeBg} font-semibold`
                              : 'hover:bg-gray-50 text-gray-700'
                          }`}
                        >
                          <span className={`flex-shrink-0 p-1.5 rounded-lg ${active ? activeBg : 'bg-gray-100'}`}>
                            <Icon className={`w-4 h-4 ${active ? activeColor : 'text-gray-500'}`} />
                          </span>
                          <span className={`text-sm ${active ? activeColor : 'text-gray-700'}`}>{label}</span>
                          {active && (
                            <span className={`ml-auto w-1.5 h-1.5 rounded-full ${activeColor.replace('text-', 'bg-')}`} />
                          )}
                        </Link>
                      );
                    })}
                  </div>

                  {/* Divider */}
                  <div className="mx-3 border-t border-gray-100" />

                  {/* Secondary section */}
                  <div className="p-2">
                    {visibleSecondary.map(({ path, label, Icon, activeColor, activeBg }) => {
                      const active = isActive(path);
                      return (
                        <Link
                          key={path}
                          to={path}
                          role="menuitem"
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                            active
                              ? `${activeBg} font-semibold`
                              : 'hover:bg-gray-50 text-gray-700'
                          }`}
                        >
                          <span className={`flex-shrink-0 p-1.5 rounded-lg ${active ? activeBg : 'bg-gray-100'}`}>
                            <Icon className={`w-4 h-4 ${active ? activeColor : 'text-gray-500'}`} />
                          </span>
                          <span className={`text-sm ${active ? activeColor : 'text-gray-700'}`}>{label}</span>
                          {active && (
                            <span className={`ml-auto w-1.5 h-1.5 rounded-full ${activeColor.replace('text-', 'bg-')}`} />
                          )}
                        </Link>
                      );
                    })}
                  </div>

                  {/* User info footer */}
                  <div className="mx-2 mb-2 mt-0 border-t border-gray-100 pt-2">
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50">
                      <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-primary-700 text-sm font-semibold">
                          {currentUser?.email?.[0]?.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-900 truncate">{currentUser?.email}</div>
                        <div className="text-xs text-gray-500 capitalize">{currentUser?.role || 'User'}</div>
                      </div>
                      <button
                        onClick={handleLogout}
                        className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Sign out"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* â”€â”€ Right: Notification + User + Logout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <NotificationBell />

              {/* User badge (desktop only) */}
              <div className="hidden sm:flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-primary-700 text-sm font-semibold">
                    {currentUser?.email?.[0]?.toUpperCase()}
                  </span>
                </div>
                <div className="hidden md:block min-w-0">
                  <div className="text-xs font-medium text-gray-900 truncate max-w-[160px]">{currentUser?.email}</div>
                  <div className="text-xs text-gray-500 capitalize">{currentUser?.role || 'User'}</div>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl border border-gray-200 bg-white hover:bg-red-50 hover:border-red-300 transition-all focus:outline-none focus:ring-2 focus:ring-red-400"
                title="Sign out"
              >
                <svg className="w-4 h-4 text-gray-500 hover:text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* â”€â”€ Main Content â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {/* pb-16 on mobile so content isn't hidden behind the bottom nav bar */}
      <main className="flex-1 overflow-auto pb-16 lg:pb-0">
        <Outlet />
      </main>

      {/* â”€â”€ Mobile Bottom Navigation Bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {/* Visible only on small screens (hidden on lg+) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 safe-bottom">
        <div className="grid grid-cols-5 h-16">
          {PRIMARY_NAV.map(({ path, label, Icon, activeColor }) => {
            const active = isActive(path);
            return (
              <Link
                key={path}
                to={path}
                className={`flex flex-col items-center justify-center gap-0.5 py-1.5 transition-colors ${
                  active ? activeColor : 'text-gray-400'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className={`text-[10px] font-medium leading-tight text-center px-1 line-clamp-1 ${
                  active ? 'font-semibold' : ''
                }`}>
                  {label === 'Pending Requests' ? 'Pending' : label}
                </span>
                {active && (
                  <span className={`absolute top-0 w-6 h-0.5 rounded-full ${activeColor.replace('text-', 'bg-')}`} />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
