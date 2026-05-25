/**
 * Top bar menu button: label + icon key for the current section.
 * Keep in sync with Layout.tsx PRIMARY_NAV / SECONDARY_NAV.
 */
export type NavSectionDisplay = {
  label: string;
  /**
   * Icon key used by Layout to look up the SVG component.
   * If omitted, Layout falls back to the app database mark.
   */
  iconKey?: string;
  /** @deprecated use iconKey â€” kept for any consumers that still read this */
  iconEmoji?: string;
};

export function getNavSectionFromRoute(pathname: string): NavSectionDisplay {
  if (pathname.startsWith('/jobs')) {
    return { label: 'Jobs', iconKey: 'jobs' };
  }

  if (pathname.startsWith('/equipment')) {
    if (pathname.endsWith('/usage-log/new'))          return { label: 'Log Usage',          iconKey: 'equipment' };
    if (pathname.endsWith('/usage-log'))              return { label: 'Usage History',       iconKey: 'equipment' };
    if (pathname.endsWith('/retire'))                 return { label: 'Retire Equipment',    iconKey: 'equipment' };
    if (pathname === '/equipment/new')                return { label: 'Register Equipment',  iconKey: 'equipment' };
    if (pathname === '/equipment/calibration-plan')   return { label: 'Calibration Plan',    iconKey: 'equipment' };
    if (pathname.match(/^\/equipment\/[^/]+$/))       return { label: 'Equipment Detail',    iconKey: 'equipment' };
    return { label: 'Lab Equipment', iconKey: 'equipment' };
  }

  switch (pathname) {
    case '/customers':    return { label: 'Customers',        iconKey: 'customers'   };
    case '/staff':        return { label: 'Staff',            iconKey: 'staff'       };
    case '/pending-jobs': return { label: 'Pending Requests', iconKey: 'pending'     };
    case '/documents':    return { label: 'Documents',        iconKey: 'documents'   };
    case '/recycle-bin':  return { label: 'Recycle Bin',      iconKey: 'recycle-bin' };
    case '/settings':     return { label: 'Settings',         iconKey: 'settings'    };
    default:              return { label: 'LIMS' };
  }
}
