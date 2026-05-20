/**
 * Top bar menu button: label + icon for the current section. Keep in sync with Layout nav links.
 */
export type NavSectionDisplay = {
  label: string;
  /** Emoji shown beside the label; omit to use the app database mark in Layout. */
  iconEmoji?: string;
};

export function getNavSectionFromRoute(pathname: string): NavSectionDisplay {
  if (pathname.startsWith('/jobs')) {
    return { label: 'Jobs', iconEmoji: '📋' };
  }

  if (pathname.startsWith('/equipment')) {
    if (pathname.endsWith('/usage-log/new')) return { label: 'Log Usage', iconEmoji: '🔧' };
    if (pathname.endsWith('/usage-log'))    return { label: 'Usage History', iconEmoji: '🔧' };
    if (pathname.endsWith('/retire'))       return { label: 'Retire Equipment', iconEmoji: '🔧' };
    if (pathname === '/equipment/new')             return { label: 'Register Equipment', iconEmoji: '🔧' };
    if (pathname === '/equipment/calibration-plan') return { label: 'Calibration Plan', iconEmoji: '🔧' };
    if (pathname.match(/^\/equipment\/[^/]+$/))    return { label: 'Equipment Detail', iconEmoji: '🔧' };
    return { label: 'Lab Equipment', iconEmoji: '🔧' };
  }

  switch (pathname) {
    case '/customers':
      return { label: 'Customers', iconEmoji: '👥' };
    case '/staff-performance':
      return { label: 'Staff Performance', iconEmoji: '📊' };
    case '/pending-jobs':
      return { label: 'Pending Requests', iconEmoji: '⏳' };
    case '/documents':
      return { label: 'Documents', iconEmoji: '📚' };
    case '/recycle-bin':
      return { label: 'Recycle Bin', iconEmoji: '🗑️' };
    case '/settings':
      return { label: 'Settings', iconEmoji: '⚙️' };
    default:
      return { label: 'LIMS' };
  }
}
