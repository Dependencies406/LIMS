# View Modes Feature Guide

## 🎨 Overview

The LIMS application now supports **three different view modes** for displaying jobs and customers:
- **List View** 📋 - Compact table format (best for detailed data viewing)
- **Card View** 🃏 - Medium-sized cards (balanced view, default)
- **Grid View** 🏁 - Compact grid (best for browsing many items)

---

## ✨ Features

### 1. **Multiple View Options**
Users can switch between three view modes using the toggle buttons in the toolbar.

### 2. **Persistent Preferences**
View preferences are automatically saved to localStorage:
- Jobs view preference saved separately
- Customers view preference saved separately
- Preferences persist across browser sessions

### 3. **Responsive Design**
All views are fully responsive and adapt to different screen sizes.

### 4. **Independent Settings**
Jobs and Customers have independent view settings, so users can:
- View jobs in List mode
- View customers in Grid mode
- Each preference is saved separately

---

## 📱 View Modes Explained

### List View (📋)
**Best for:** Detailed data analysis, comparing multiple fields

**Features:**
- Table format with all important fields visible
- Sortable columns (future enhancement)
- Compact rows for viewing many items at once
- Horizontal scrolling on mobile

**Jobs Display:**
- Job ID, Title, Customer, Status, Equipment count, Due Date, Created Date

**Customers Display:**
- Code, Name, Contact, Email, Phone, Created Date

---

### Card View (🃏) - DEFAULT
**Best for:** Balanced viewing with good detail and visual appeal

**Features:**
- Medium-sized cards with key information
- Easy to scan and read
- Shows most important fields
- Good spacing for readability

**Jobs Display:**
- Job ID, Status badge, Title, Customer, Equipment count, Due Date, Staff, Created Date

**Customers Display:**
- Customer Code, Name, Contact, Email, Phone, Address
- 3 columns on desktop, 2 on tablet, 1 on mobile

---

### Grid View (🏁)
**Best for:** Browsing many items quickly, overview

**Features:**
- Compact cards in tight grid
- Maximum items visible at once
- Essential information only
- Great for finding specific items quickly

**Jobs Display:**
- 4 columns on large screens
- Job ID, Status, Title, Customer, Equipment count, Due Date

**Customers Display:**
- 5 columns on large screens
- Customer Code, Name, Contact, Email

---

## 🔧 Technical Implementation

### Components Created

#### 1. **ViewToggle Component**
```typescript
// src/components/common/ViewToggle.tsx
<ViewToggle 
  currentView={view} 
  onViewChange={setView} 
/>
```
Reusable toggle component for switching views.

#### 2. **useViewPreference Hook**
```typescript
// src/hooks/useViewPreference.tsx
const [view, setView] = useViewPreference('storage-key', 'card');
```
Custom hook that manages view state with localStorage persistence.

#### 3. **View Components**

**Jobs:**
- `src/components/jobs/JobListView.tsx`
- `src/components/jobs/JobCardView.tsx`
- `src/components/jobs/JobGridView.tsx`

**Customers:**
- `src/components/customers/CustomerListView.tsx`
- `src/components/customers/CustomerCardView.tsx`
- `src/components/customers/CustomerGridView.tsx`

---

## 💻 Usage in Dashboard

The Dashboard component now includes:

```typescript
// Import view components
import { ViewToggle } from './common/ViewToggle';
import { useViewPreference } from '../hooks/useViewPreference';
import { JobListView, JobCardView, JobGridView } from './jobs/...';
import { CustomerListView, CustomerCardView, CustomerGridView } from './customers/...';

// Use view preferences
const [jobsView, setJobsView] = useViewPreference('lims-jobs-view', 'card');
const [customersView, setCustomersView] = useViewPreference('lims-customers-view', 'card');

// Render ViewToggle
<ViewToggle
  currentView={activeTab === 'jobs' ? jobsView : customersView}
  onViewChange={activeTab === 'jobs' ? setJobsView : setCustomersView}
/>

// Conditionally render views
{jobsView === 'list' && <JobListView ... />}
{jobsView === 'card' && <JobCardView ... />}
{jobsView === 'grid' && <JobGridView ... />}
```

---

## 🎯 User Experience

### Switching Views
1. User clicks one of the three view toggle buttons (List/Card/Grid)
2. View instantly changes
3. Preference is saved to localStorage
4. Next time user visits, the last selected view is restored

### Visual Feedback
- Active view button is highlighted in blue
- Hover effects on buttons
- Smooth transitions between views
- Icons and labels for clarity

---

## 📦 LocalStorage Keys

View preferences are stored with these keys:
- `lims-jobs-view` - Jobs view preference ('list' | 'card' | 'grid')
- `lims-customers-view` - Customers view preference ('list' | 'card' | 'grid')

---

## 🔮 Future Enhancements

Potential improvements:
1. **Sortable columns** in List view
2. **Custom column selection** for List view
3. **Bulk actions** in List view (checkbox selection)
4. **Drag-and-drop reordering** in Grid view
5. **Custom layouts** (save multiple view configurations)
6. **Export to Excel** from List view
7. **Print-optimized** List view
8. **Density options** (comfortable, compact, spacious)

---

## 🎨 Customization

### Adding a New View Mode

To add a new view mode (e.g., "Table" view):

1. **Update ViewType:**
```typescript
// src/components/common/ViewToggle.tsx
export type ViewType = 'list' | 'card' | 'grid' | 'table';
```

2. **Add to ViewToggle:**
```typescript
const views = [
  // ... existing views
  { type: 'table', icon: '▤', label: 'Table' },
];
```

3. **Create Component:**
```typescript
// src/components/jobs/JobTableView.tsx
export const JobTableView = ({ jobs, onJobClick }) => {
  // Your custom view
};
```

4. **Add to Dashboard:**
```typescript
{jobsView === 'table' && <JobTableView ... />}
```

---

## 🐛 Troubleshooting

### View preference not persisting
- Check browser localStorage is enabled
- Check console for errors
- Clear localStorage: `localStorage.removeItem('lims-jobs-view')`

### View not switching
- Check console for errors
- Verify ViewToggle is receiving correct props
- Check conditional rendering logic

### Layout issues
- Test on different screen sizes
- Check responsive classes (sm:, md:, lg:, xl:)
- Verify CSS classes are applied

---

## ✅ Testing Checklist

- [ ] Switch between all three views for Jobs
- [ ] Switch between all three views for Customers
- [ ] Refresh page - view preference persists
- [ ] Switch tabs - each tab keeps its own view
- [ ] Test on mobile (responsive)
- [ ] Test on tablet (responsive)
- [ ] Test on desktop (all columns visible)
- [ ] Click items in each view to open modals
- [ ] Search works in all views
- [ ] Filter works in all views (Jobs)

---

## 📚 Related Files

- `src/components/common/ViewToggle.tsx` - View toggle button component
- `src/hooks/useViewPreference.tsx` - View preference management hook
- `src/components/jobs/*.tsx` - Job view components
- `src/components/customers/*.tsx` - Customer view components
- `src/components/Dashboard.tsx` - Main dashboard with view switching

---

## 🎉 Benefits

1. **Better User Experience** - Users can choose how they view data
2. **Increased Productivity** - Right view for the right task
3. **Accessibility** - Different users prefer different formats
4. **Professional** - Feature found in enterprise applications
5. **Extensible** - Easy to add more view types in the future

---

**Enjoy your new view options!** 🎨

