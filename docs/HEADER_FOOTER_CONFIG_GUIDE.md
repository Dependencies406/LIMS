# Header/Footer Configuration Module - Implementation Guide

## Overview
A comprehensive module for configuring PDF headers and footers with dynamic field selection, reordering, and real-time preview.

## Features

### ✅ **Implemented Features**
1. **Dynamic Field Selection**
   - Scans all available fields from Company Info
   - Dropdown/checkbox selection interface
   - Support for text, image, address, contact, and custom fields

2. **Field Reordering**
   - Native HTML5 drag-and-drop (no external dependencies)
   - Visual feedback during dragging
   - Order preservation in configuration

3. **Configuration Management**
   - Save/load configurations to Firestore
   - Separate header and footer configurations
   - Multiple configurations per type

4. **Real-time Preview**
   - Live preview of header/footer layout
   - Responsive to all configuration changes
   - Shows actual company data

5. **Layout Options**
   - Horizontal, Vertical, Grid layouts
   - Left, Center, Right alignment
   - Adjustable spacing and font size

## Files Created

### Components
- `src/components/HeaderFooterConfigModal.tsx` - Main configuration modal (without react-beautiful-dnd)
- `src/components/HeaderFooterConfigManager.tsx` - Management interface

### Services
- `src/services/headerFooterConfigService.ts` - CRUD operations and rendering

### Contexts
- `src/contexts/HeaderFooterConfigContext.tsx` - Global state management

## Installation (Alternative Approach)

Since `react-beautiful-dnd` is deprecated and has compatibility issues with React 19, I've created a version using **native HTML5 drag-and-drop** instead.

### No Additional Dependencies Required! ✅

The implementation uses:
- Native HTML5 Drag and Drop API
- React built-in hooks
- Existing project dependencies

## Usage

### 1. Add Context Provider to App.tsx

```typescript
import { HeaderFooterConfigProvider } from './contexts/HeaderFooterConfigContext';

function App() {
  return (
    <AuthProvider>
      <CompanyInfoProvider>
        <PdfSettingsProvider>
          <HeaderFooterConfigProvider>
            {/* Your app content */}
          </HeaderFooterConfigProvider>
        </PdfSettingsProvider>
      </CompanyInfoProvider>
    </AuthProvider>
  );
}
```

### 2. Add to Settings Page

```typescript
import { HeaderFooterConfigManager } from '../components/HeaderFooterConfigManager';

// In your SettingsPage component
<HeaderFooterConfigManager />
```

### 3. Use in PDF Generation

```typescript
import { useHeaderFooterConfig } from '../contexts/HeaderFooterConfigContext';
import { renderHeaderFooterConfig } from '../services/headerFooterConfigService';

const { getConfigById } = useHeaderFooterConfig();
const { companyInfo } = useCompanyInfo();

// Get configuration
const headerConfig = getConfigById('your-config-id');

// Render to HTML
const headerHTML = renderHeaderFooterConfig(headerConfig, companyInfo);

// Use in your PDF generation
```

## Firebase Setup

### Update Firestore Rules

Add to your Firestore security rules:

```javascript
// Header/Footer Configurations
match /headerFooterConfigs/{configId} {
  allow read: if request.auth != null;
  allow write: if request.auth != null && 
    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
}
```

## Available Fields

The module automatically scans and provides these fields from Company Info:

### Text Fields
- Company Name
- Tax ID
- Registration Number
- Business License

### Image Fields
- Company Logo

### Address Fields
- Street Address
- City
- State/Province
- Postal Code
- Country

### Contact Fields
- Phone Number
- Email Address
- Website
- Fax Number

### Custom Fields
- Custom Text (user-defined)

## Configuration Options

### Layout Types
- **Horizontal**: Fields arranged in a row
- **Vertical**: Fields stacked vertically
- **Grid**: Fields in a flexible grid

### Alignment
- **Left**: Align to left edge
- **Center**: Center alignment
- **Right**: Align to right edge

### Styling
- **Spacing**: 0-50px between fields
- **Font Size**: 8-24pt

## API Reference

### Context Hook: `useHeaderFooterConfig()`

```typescript
const {
  configs,              // All configurations
  loading,              // Loading state
  error,                // Error message
  saveConfig,           // Save configuration
  deleteConfig,         // Delete configuration
  refreshConfigs,       // Refresh from Firestore
  getConfigById,        // Get specific config
  getConfigsByType,     // Get headers or footers
  getDefaultConfig      // Get default config
} = useHeaderFooterConfig();
```

### Service Functions

```typescript
// Get all configurations
const configs = await getHeaderFooterConfigs();

// Get specific configuration
const config = await getHeaderFooterConfig(id);

// Save configuration
const saved = await saveHeaderFooterConfig(config, userId);

// Delete configuration
await deleteHeaderFooterConfig(id);

// Render to HTML
const html = renderHeaderFooterConfig(config, companyInfo);

// Validate configuration
const errors = validateHeaderFooterConfig(config);

// Export/Import
const json = exportConfig(config);
const imported = importConfig(jsonString);
```

## TypeScript Types

```typescript
interface FieldConfig {
  id: string;
  label: string;
  value: string;
  type: 'text' | 'image' | 'address' | 'contact' | 'custom';
  enabled: boolean;
  order: number;
  customValue?: string;
}

interface HeaderFooterConfig {
  id: string;
  name: string;
  type: 'header' | 'footer';
  fields: FieldConfig[];
  layout: 'horizontal' | 'vertical' | 'grid';
  alignment: 'left' | 'center' | 'right';
  spacing: number;
  fontSize: number;
  createdAt: Date;
  updatedAt: Date;
  updatedBy: string;
}
```

## Recommended Workflow

1. **Setup Company Info First**
   - Go to Settings → Company Information
   - Fill in all relevant fields
   - Upload company logo

2. **Create Header Configuration**
   - Go to Settings → Header/Footer Configurations
   - Click "Create Header"
   - Select desired fields
   - Drag to reorder
   - Adjust layout and styling
   - Preview in real-time
   - Save configuration

3. **Create Footer Configuration**
   - Same process as header
   - Typically includes contact info and address

4. **Use in PDF Generation**
   - Select configuration in PDF settings
   - Configuration will be applied to all generated PDFs

## Benefits

✅ **No External Dependencies** - Uses native HTML5 APIs  
✅ **Fully Typed** - Complete TypeScript support  
✅ **Real-time Preview** - See changes instantly  
✅ **Flexible** - Support for any company info field  
✅ **Persistent** - Saved to Firestore  
✅ **Reusable** - Multiple configurations per type  
✅ **Admin-only** - Secure configuration management  

## Next Steps

1. Update your Firebase security rules
2. Add the provider to App.tsx
3. Add the manager to your Settings page
4. Test creating and saving configurations
5. Integrate with your PDF generation service

## Troubleshooting

### Issue: Drag and drop not working
**Solution**: Make sure you're using the version without `react-beautiful-dnd`. The native HTML5 version should work out of the box.

### Issue: Fields not showing
**Solution**: Ensure Company Info is properly set up and the `CompanyInfoProvider` is wrapping your app.

### Issue: Permission errors
**Solution**: Update your Firestore security rules to include the `headerFooterConfigs` collection.

### Issue: Preview not updating
**Solution**: Check that the `companyInfo` context is properly loaded and contains data.

## Alternative: Simpler Implementation

If you want an even simpler approach without the full configuration UI, you can:

1. Use the default configurations provided
2. Modify them programmatically
3. Store preferences in localStorage instead of Firestore

See `getDefaultConfigs()` in the service file for ready-to-use configurations.

