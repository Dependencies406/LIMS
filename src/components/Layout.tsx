import React, { useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';

export const Layout: React.FC = () => {
  const { currentUser, logout, isAdmin } = useAuth();
  const { success, error: showError } = useToast();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  const handleLogout = async () => {
    try {
      await logout();
      success('Logged out successfully');
    } catch (err) {
      showError('Failed to logout');
    }
  };

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className={`${sidebarCollapsed ? 'w-20' : 'w-64'} bg-white shadow-lg flex flex-col transition-all duration-300 ease-in-out`}>
        {/* Logo/Brand */}
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          {!sidebarCollapsed && (
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 flex-shrink-0">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="8" fill="#E5E7EB" stroke="#3B82F6" strokeWidth="1"/>
                  <circle cx="12" cy="4" r="2" fill="#3B82F6"/>
                  <circle cx="12" cy="20" r="2" fill="#3B82F6"/>
                  <circle cx="4" cy="12" r="2" fill="#3B82F6"/>
                  <circle cx="20" cy="12" r="2" fill="#3B82F6"/>
                  <rect x="10" y="2" width="4" height="4" fill="#3B82F6"/>
                  <rect x="10" y="18" width="4" height="4" fill="#3B82F6"/>
                  <rect x="2" y="10" width="4" height="4" fill="#3B82F6"/>
                  <rect x="18" y="10" width="4" height="4" fill="#3B82F6"/>
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-primary-600">LIMS</h1>
                <p className="text-sm text-gray-500 mt-1">Laboratory Information Management System</p>
              </div>
            </div>
          )}
          {sidebarCollapsed && (
            <div className="text-center">
              <div className="w-8 h-8 mx-auto">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="8" fill="#E5E7EB" stroke="#3B82F6" strokeWidth="1"/>
                  <circle cx="12" cy="4" r="2" fill="#3B82F6"/>
                  <circle cx="12" cy="20" r="2" fill="#3B82F6"/>
                  <circle cx="4" cy="12" r="2" fill="#3B82F6"/>
                  <circle cx="20" cy="12" r="2" fill="#3B82F6"/>
                  <rect x="10" y="2" width="4" height="4" fill="#3B82F6"/>
                  <rect x="10" y="18" width="4" height="4" fill="#3B82F6"/>
                  <rect x="2" y="10" width="4" height="4" fill="#3B82F6"/>
                  <rect x="18" y="10" width="4" height="4" fill="#3B82F6"/>
                </svg>
              </div>
            </div>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-all duration-200 hover:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg className={`w-4 h-4 text-gray-600 transition-transform duration-200 ${sidebarCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <Link
            to="/jobs"
            className={`flex items-center ${sidebarCollapsed ? 'justify-center px-2' : 'space-x-3 px-4'} py-3 rounded-lg transition-colors ${
              isActive('/jobs')
                ? 'bg-primary-100 text-primary-700 font-semibold'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
            title={sidebarCollapsed ? 'Jobs' : ''}
          >
            <span className="text-xl">📋</span>
            {!sidebarCollapsed && <span>Jobs</span>}
          </Link>

          <Link
            to="/customers"
            className={`flex items-center ${sidebarCollapsed ? 'justify-center px-2' : 'space-x-3 px-4'} py-3 rounded-lg transition-colors ${
              isActive('/customers')
                ? 'bg-primary-100 text-primary-700 font-semibold'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
            title={sidebarCollapsed ? 'Customers' : ''}
          >
            <span className="text-xl">👥</span>
            {!sidebarCollapsed && <span>Customers</span>}
          </Link>


          {isAdmin && (
            <Link
              to="/settings"
              className={`flex items-center ${sidebarCollapsed ? 'justify-center px-2' : 'space-x-3 px-4'} py-3 rounded-lg transition-colors ${
                isActive('/settings')
                  ? 'bg-primary-100 text-primary-700 font-semibold'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
              title={sidebarCollapsed ? 'Settings' : ''}
            >
              <span className="text-xl">⚙️</span>
              {!sidebarCollapsed && <span>Settings</span>}
            </Link>
          )}
        </nav>

        {/* User Profile & Logout */}
        <div className="p-4 border-t border-gray-200">
          {!sidebarCollapsed ? (
            <>
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                  <span className="text-primary-700 font-semibold text-lg">
                    {currentUser?.email?.[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {currentUser?.email}
                  </p>
                  <p className="text-xs text-gray-500 capitalize">
                    {currentUser?.role || 'User'}
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 bg-white hover:bg-red-50 transition-all duration-200 hover:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  title="Logout"
                >
                  <svg className="w-4 h-4 text-gray-600 hover:text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center space-y-3">
              <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                <span className="text-primary-700 font-semibold text-lg">
                  {currentUser?.email?.[0].toUpperCase()}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 bg-white hover:bg-red-50 transition-all duration-200 hover:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                title="Logout"
              >
                <svg className="w-4 h-4 text-gray-600 hover:text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden flex flex-col">
        <Outlet />
      </main>
    </div>
  );
};

