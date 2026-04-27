# Permission Discovery System Guide

## Overview

The Permission Discovery System automatically scans your codebase for new features, implementations, and processes, then suggests new permissions to add to the role management system. This helps keep your permission system up-to-date as your application evolves.

## How It Works

### 1. **Automatic Scanning**
The system scans multiple sources:
- **Route Definitions**: Discovers permissions from new routes in `App.tsx`
- **Action Handlers**: Finds permissions from button handlers and form submissions
- **Service Methods**: Detects CRUD operations and other actions in service files
- **Permission Registry**: Uses manually registered permissions from code

### 2. **Permission Registry**
Developers can manually register permissions in their code using the `permissionRegistry`:

```typescript
import { permissionRegistry } from '../services/permissionDiscoveryService';

// Register a permission when defining a feature
const handleExportJobs = () => {
  permissionRegistry.register(
    'jobs.export',
    'Jobs',
    'Export jobs to CSV/Excel',
    __filename
  );
  // ... export logic
};
```

### 3. **Discovery Process**
1. Click "Scan for New Permissions" in Role Management
2. System scans codebase for new permissions
3. Displays discovered permissions with confidence levels
4. Select permissions to add
5. Follow instructions to add them to the system

## Using the Discovery Feature

### Step 1: Register Permissions in Code

When implementing a new feature, register its permission:

```typescript
// In your component or service file
import { permissionRegistry } from '../services/permissionDiscoveryService';

// Option 1: Register at component/service level
useEffect(() => {
  permissionRegistry.register(
    'jobs.bulkDelete',
    'Jobs',
    'Delete multiple jobs at once',
    __filename
  );
}, []);

// Option 2: Register in action handlers
const handleBulkDelete = () => {
  permissionRegistry.register(
    'jobs.bulkDelete',
    'Jobs',
    'Delete multiple jobs at once'
  );
  // ... bulk delete logic
};
```

### Step 2: Scan for New Permissions

1. Navigate to **Settings → Role Management**
2. Click **"Scan for New Permissions"** button
3. Wait for the scan to complete
4. Review discovered permissions

### Step 3: Add Discovered Permissions

1. Select the permissions you want to add
2. Click **"Add Selected Permissions"**
3. Follow the instructions shown:
   - Add permissions to `src/services/roleService.ts` in the `ALL_PERMISSIONS` array
   - Update the `PermissionAction` type in `src/types/index.ts`

### Example: Adding a New Permission

**1. Register in code:**
```typescript
// In src/components/JobsPage.tsx
import { permissionRegistry } from '../services/permissionDiscoveryService';

const handleBulkExport = () => {
  permissionRegistry.register(
    'jobs.bulkExport',
    'Jobs',
    'Export multiple jobs at once'
  );
  // ... export logic
};
```

**2. Scan and discover:**
- Click "Scan for New Permissions"
- System finds `jobs.bulkExport`

**3. Add to system:**
- Select `jobs.bulkExport`
- Click "Add Selected Permissions"
- Add to `ALL_PERMISSIONS` in `roleService.ts`:
```typescript
{ action: 'jobs.bulkExport', category: 'Jobs', description: 'Export multiple jobs at once' },
```
- Add to `PermissionAction` type in `types/index.ts`:
```typescript
| 'jobs.bulkExport'
```

## Best Practices

### 1. Register Early
Register permissions when you implement features, not after:
```typescript
// ✅ Good: Register when defining the feature
const handleNewFeature = () => {
  permissionRegistry.register('feature.action', 'Feature', 'Description');
  // ... implementation
};

// ❌ Bad: Register later or forget
const handleNewFeature = () => {
  // ... implementation (permission not registered)
};
```

### 2. Use Descriptive Names
Follow the naming convention: `category.action`
```typescript
// ✅ Good
'jobs.bulkExport'
'customers.merge'
'documents.archive'

// ❌ Bad
'export'
'merge'
'archive'
```

### 3. Provide Clear Descriptions
Write descriptions that explain what the permission allows:
```typescript
// ✅ Good
'Export multiple jobs to CSV/Excel in a single operation'

// ❌ Bad
'Export'
```

### 4. Scan Regularly
Scan for new permissions:
- After implementing new features
- Before major releases
- During code reviews

## Advanced Usage

### Batch Registration
Register multiple permissions at once:

```typescript
const permissions = [
  { action: 'jobs.bulkExport', category: 'Jobs', description: 'Export multiple jobs' },
  { action: 'jobs.bulkDelete', category: 'Jobs', description: 'Delete multiple jobs' },
  { action: 'jobs.bulkUpdate', category: 'Jobs', description: 'Update multiple jobs' },
];

permissions.forEach(p => {
  permissionRegistry.register(p.action, p.category, p.description);
});
```

### Conditional Registration
Register permissions conditionally:

```typescript
if (featureFlags.bulkOperations) {
  permissionRegistry.register(
    'jobs.bulkExport',
    'Jobs',
    'Export multiple jobs at once'
  );
}
```

## Troubleshooting

### Permissions Not Discovered

**Problem**: Registered permission doesn't appear in scan results.

**Solutions**:
1. Ensure you're calling `permissionRegistry.register()` when the code runs
2. Check that the permission action follows the naming convention
3. Verify the permission isn't already in the system
4. Try refreshing and scanning again

### False Positives

**Problem**: Discovery suggests permissions that shouldn't be permissions.

**Solution**: Review discovered permissions carefully and only add legitimate ones. The system uses pattern matching which may occasionally suggest non-permission actions.

### Type Errors After Adding Permissions

**Problem**: TypeScript errors after adding new permissions.

**Solution**: Make sure you:
1. Added the permission to `PermissionAction` type in `types/index.ts`
2. Added the permission to `ALL_PERMISSIONS` in `roleService.ts`
3. Restarted your TypeScript server

## Future Enhancements

The discovery system can be enhanced with:
- **AST Parsing**: Parse TypeScript/JavaScript files to extract permissions automatically
- **Comment-Based Annotations**: Use `@permission` comments in code
- **Route Analysis**: Automatically discover permissions from route definitions
- **Service Method Analysis**: Detect permissions from service method names
- **Integration with CI/CD**: Auto-scan on pull requests

## Example: Complete Workflow

```typescript
// 1. Implement new feature
// src/components/JobsPage.tsx
import { permissionRegistry } from '../services/permissionDiscoveryService';

export const JobsPage = () => {
  const handleBulkArchive = async () => {
    // Register permission
    permissionRegistry.register(
      'jobs.bulkArchive',
      'Jobs',
      'Archive multiple jobs at once'
    );
    
    // Implementation
    await archiveMultipleJobs(selectedJobs);
  };
  
  return (
    <button onClick={handleBulkArchive}>
      Archive Selected
    </button>
  );
};

// 2. Scan for permissions in Role Management UI
// 3. Select 'jobs.bulkArchive' from discovered permissions
// 4. Add to roleService.ts:
export const ALL_PERMISSIONS = [
  // ... existing permissions
  { action: 'jobs.bulkArchive', category: 'Jobs', description: 'Archive multiple jobs at once' },
];

// 5. Add to types/index.ts:
export type PermissionAction = 
  // ... existing permissions
  | 'jobs.bulkArchive';

// 6. Use in role management
// The permission is now available for assignment to roles!
```

## Summary

The Permission Discovery System helps you:
- ✅ Keep permissions up-to-date automatically
- ✅ Discover new features as you build them
- ✅ Maintain consistency in permission naming
- ✅ Reduce manual permission management overhead

Register permissions as you code, scan regularly, and your permission system will stay current with your application!































