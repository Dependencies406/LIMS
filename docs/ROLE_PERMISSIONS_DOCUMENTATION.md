# Role Management & Permissions Documentation

## Overview

This document lists all processes, actions, and permissions available in the LIMS application. The role management system lets administrators create custom roles with granular permissions. The list is aligned with **current app features only** (Forms, old ISO Documents, and Master List have been removed in favor of Documents Index & Distributor).

## System Roles

### Administrator (`admin`)
- **Description**: Full system access with all permissions
- **Type**: System role (cannot be deleted)
- **Permissions**: All permissions (full access)

### Staff and custom roles
- **Description**: Access is defined by the permissions assigned to the role
- **Type**: Custom roles are stored in Firestore; "staff" may be a custom role name
- **Default / example**: Jobs (View, Create, Edit, Generate PDF), Customers (View, Create, Edit), Documents Index (View, Manage), Service Requests (View, Convert), Settings (View, Job ID / Customer ID / Company Info), etc. Assign only the permissions that match the current permission list below.

## Permission List (Current App)

### Service Requests
| Permission | Description |
|------------|-------------|
| `serviceRequests.view` | View pending service requests |
| `serviceRequests.convert` | Convert service requests to jobs |
| `serviceRequests.cancel` | Cancel service requests |
| `serviceRequests.delete` | Delete service requests |

### Jobs
| Permission | Description |
|------------|-------------|
| `jobs.view` | View jobs list and details |
| `jobs.create` | Create new jobs |
| `jobs.edit` | Edit existing jobs |
| `jobs.delete` | Delete jobs |
| `jobs.assign` | Assign jobs to staff members |
| `jobs.changeStatus` | Change job status (Pending, In Progress, Completed, etc.) |
| `jobs.export` | Export jobs to CSV/Excel |
| `jobs.import` | Import jobs from Excel |
| `jobs.generatePdf` | Generate job PDFs |
| `jobs.viewDeleted` | View deleted jobs (soft delete) |

### Customers
| Permission | Description |
|------------|-------------|
| `customers.view` | View customers list and details |
| `customers.create` | Create new customers |
| `customers.edit` | Edit existing customers |
| `customers.delete` | Delete customers |
| `customers.export` | Export customers to CSV |

### Documents (Documents Index & Distributor)
| Permission | Description |
|------------|-------------|
| `documentIndex.view` | View documents index |
| `documentIndex.manage` | Create/edit/delete documents index entries |

### Spreadsheet Templates
| Permission | Description |
|------------|-------------|
| `spreadsheetTemplates.view` | View spreadsheet templates |
| `spreadsheetTemplates.create` | Create spreadsheet templates |
| `spreadsheetTemplates.edit` | Edit spreadsheet templates |
| `spreadsheetTemplates.delete` | Delete spreadsheet templates |
| `spreadsheetTemplates.duplicate` | Duplicate spreadsheet templates |

### PDF Templates
| Permission | Description |
|------------|-------------|
| `pdfTemplates.view` | View PDF templates |
| `pdfTemplates.create` | Create PDF templates |
| `pdfTemplates.edit` | Edit PDF templates |
| `pdfTemplates.delete` | Delete PDF templates |
| `pdfTemplates.duplicate` | Duplicate PDF templates |

### Users
| Permission | Description |
|------------|-------------|
| `users.view` | View users list |
| `users.create` | Create new users |
| `users.edit` | Edit existing users |
| `users.delete` | Delete users |
| `users.activate` | Activate user accounts |
| `users.deactivate` | Deactivate user accounts |

### Roles
| Permission | Description |
|------------|-------------|
| `roles.view` | View roles list |
| `roles.create` | Create new roles |
| `roles.edit` | Edit existing roles |
| `roles.delete` | Delete roles |

### Settings
| Permission | Description |
|------------|-------------|
| `settings.view` | View settings page |
| `settings.jobIdConfig` | Configure Job ID settings (prefix, sequence, etc.) |
| `settings.customerIdConfig` | Configure Customer ID settings |
| `settings.reportNumberConfig` | Configure Report Number settings |
| `settings.companyInfo` | Manage company information (name, logo, address, etc.) |
| `settings.pdfSettings` | Configure PDF settings (templates, headers, footers, etc.) |

### Certificate Numbers
| Permission | Description |
|------------|-------------|
| `certificateNumbers.view` | View certificate number configurations |
| `certificateNumbers.edit` | Create and edit certificate number configurations |

### Staff Performance
| Permission | Description |
|------------|-------------|
| `staffPerformance.view` | View staff performance dashboard and metrics for all staff |
| `staffPerformance.viewOwn` | View own performance metrics |
| `staffPerformance.exportLogs` | Export staff performance logs |

## Implementation

### Sources
- **Permission definitions**: `src/services/roleService.ts` — `ALL_PERMISSIONS`
- **Permission type**: `src/types/index.ts` — `PermissionAction` union
- **Role Management UI**: `src/components/RoleManagementModal.tsx` — Create/Edit Role modal shows only permissions in `ALL_PERMISSIONS`; loading and saving roles strips any legacy permission strings (e.g. old forms.*, documents.*, masterLists.*) so only the current set is used.

### Role service
- **Location**: `src/services/roleService.ts`
- **Functions**: `subscribeToRoles()`, `getAllRoles()`, `getRoleById()`, `createRole()`, `updateRole()`, `deleteRole()`, `hasPermission()`, `getPermissionsByCategory()`

### Usage
- **Checking permission**: `usePermission('documentIndex.manage')` or `roleService.hasPermission(roleId, 'jobs.edit')`
- **Settings access**: `useSettingsAccess()` — grants access if the user has any of the settings-related permissions (e.g. `settings.view`, `users.view`, `certificateNumbers.view`, etc.)

## Verification (UI visibility and guards)

Sanity checks for key roles:

| Area | Admin | Staff / custom role | Basic (no permissions) |
|------|--------|----------------------|--------------------------|
| **Sidebar** | All links (Jobs, Customers, Documents, Settings, Staff Performance, Recycle Bin). | Documents link visible; Settings visible if any `settings.*` or `users.view` etc.; Staff Performance only if `staffPerformance.view`. | Only links for routes they can open (e.g. Jobs, Customers, Documents); Settings only if they have a settings-related permission. |
| **Documents (/documents)** | View list; Manage button and create/edit/delete. | View list; Manage if role has `documentIndex.manage`. | View list; no Manage if no `documentIndex.manage` (and not admin). |
| **Settings** | Full access (useSettingsAccess + isAdmin). | Sections shown per permission (Job ID, Customer ID, Users, Roles, PDF/Spreadsheet templates, Certificate Numbers). | No Settings if no settings-related permission. |
| **Jobs** | Full (create, edit, delete, assign, export, etc. per permissions). | Actions gated by `jobs.*` (JobsPage: canCreateJobs, canEditJobs, canDeleteJobs, canAssignJobs, canExportJobs, canViewDeleted). | View-only if only `jobs.view`; no create/edit/delete without corresponding permission. |
| **Edit Role modal** | Shows only current categories (Service Requests, Jobs, Customers, Documents, Spreadsheet/PDF Templates, Users, Roles, Settings, Certificate Numbers, Staff Performance). No Forms or Master List. | Same list; selections saved; legacy permission strings stripped on load/save. | N/A (only admin or users with roles access see Role Management). |

Firestore rules: `document_index` read for any authenticated user; write for admin or staff. Legacy `documents` and `formTemplates`/`formResponses` rules retained for existing data; app uses `document_index` for the Documents page.

## Security

- Only users with appropriate permissions (e.g. admin or roles management) can open Role Management.
- System role `admin` cannot be deleted; its permissions can be customized.
- Role deletion is blocked if any user is assigned to that role.
- Firestore rules enforce access per collection; role/permission checks in the app control UI and workflows.
