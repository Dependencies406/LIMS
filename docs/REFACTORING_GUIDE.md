# LIMS Refactoring Guide

## 🎯 Refactoring Goals

This refactoring aims to make the codebase:
- **Simple**: Easy to understand and maintain
- **Modular**: Components focused on single responsibilities
- **Extensible**: Easy to add new features without modifying existing code
- **Testable**: Separation of concerns for easier testing
- **Scalable**: Structure that supports growth

---

## 📊 Current Architecture

```
src/
├── components/        # UI Components (some too large)
├── contexts/         # React Context (Auth)
├── hooks/            # Custom hooks (only useToast)
├── services/         # Firebase service (minimal)
├── types/            # TypeScript types
└── utils/            # Constants (including hardcoded config)
```

### Issues Identified:

1. **Large Components**: Dashboard (317 lines), JobModal (503 lines)
2. **Mixed Concerns**: UI components handle database operations
3. **Code Duplication**: Similar data fetching patterns
4. **Security**: Firebase config hardcoded in source
5. **Limited Reusability**: No shared UI components
6. **No Routing**: Not using installed react-router-dom

---

## 🏗️ Improved Architecture

```
src/
├── components/
│   ├── common/           # Reusable UI components
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── FormField.tsx
│   │   ├── Modal.tsx
│   │   ├── Table.tsx
│   │   └── LoadingSpinner.tsx
│   ├── jobs/            # Job-related components
│   │   ├── JobList.tsx
│   │   ├── JobCard.tsx
│   │   ├── JobForm.tsx
│   │   └── JobModal.tsx
│   ├── customers/       # Customer-related components
│   │   ├── CustomerList.tsx
│   │   ├── CustomerCard.tsx
│   │   ├── CustomerForm.tsx
│   │   └── CustomerModal.tsx
│   ├── layout/          # Layout components
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   └── MainLayout.tsx
│   └── Dashboard.tsx    # Simplified dashboard
├── contexts/
│   └── AuthContext.tsx
├── hooks/
│   ├── useToast.tsx
│   ├── useJobs.tsx       # Job data management
│   ├── useCustomers.tsx  # Customer data management
│   └── useForm.tsx       # Form state management
├── services/
│   ├── firebase.ts       # Firebase initialization
│   ├── jobService.ts     # Job CRUD operations
│   ├── customerService.ts # Customer CRUD operations
│   └── authService.ts    # Authentication operations
├── routes/
│   ├── index.tsx         # Route configuration
│   └── ProtectedRoute.tsx
├── types/
│   └── index.ts
├── utils/
│   ├── constants.ts      # Constants only
│   ├── validators.ts     # Validation functions
│   └── formatters.ts     # Formatting utilities
└── config/
    └── firebase.ts       # Firebase config from env vars
```

---

## 🔧 Refactoring Steps

### Phase 1: Fix Immediate Issues ✅
- [x] Fix missing `getDoc` import in CustomerModal
- [x] Document current architecture

### Phase 2: Service Layer
Create dedicated services for database operations:

```typescript
// services/jobService.ts
export const jobService = {
  getJobs: () => Promise<Job[]>
  getJobById: (id: string) => Promise<Job>
  createJob: (data: JobInput) => Promise<Job>
  updateJob: (id: string, data: Partial<Job>) => Promise<void>
  deleteJob: (id: string) => Promise<void>
}

// services/customerService.ts
export const customerService = {
  getCustomers: () => Promise<Customer[]>
  getCustomerById: (id: string) => Promise<Customer>
  createCustomer: (data: CustomerInput) => Promise<Customer>
  updateCustomer: (id: string, data: Partial<Customer>) => Promise<void>
  deleteCustomer: (id: string) => Promise<void>
  generateCustomerCode: () => Promise<string>
}
```

**Benefits:**
- Centralized database logic
- Easier to test
- Can swap implementations (e.g., mock for testing)
- Consistent error handling

### Phase 3: Custom Data Hooks
Create hooks that use the services:

```typescript
// hooks/useJobs.tsx
export const useJobs = () => {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Real-time subscription logic
  // CRUD operations
  
  return { jobs, loading, error, createJob, updateJob, deleteJob }
}

// hooks/useCustomers.tsx
export const useCustomers = () => {
  // Similar pattern
}
```

**Benefits:**
- Reusable data logic
- Consistent loading/error states
- Single source of truth

### Phase 4: Reusable UI Components

```typescript
// components/common/Button.tsx
export const Button = ({ variant, size, children, ...props }) => {
  // Consistent button styling
}

// components/common/FormField.tsx
export const FormField = ({ label, error, required, children }) => {
  // Consistent form field layout
}

// components/common/Modal.tsx
export const Modal = ({ isOpen, onClose, title, children }) => {
  // Reusable modal wrapper
}
```

**Benefits:**
- Consistent UI
- Less code duplication
- Easier to update styling globally

### Phase 5: Environment Configuration

```typescript
// .env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...

// config/firebase.ts
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  // ... other config from env vars
}
```

**Benefits:**
- Security: No credentials in source code
- Flexibility: Different configs for dev/staging/prod
- Best practice

### Phase 6: Routing Structure

```typescript
// routes/index.tsx
export const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<ProtectedRoute />}>
      <Route path="/" element={<Dashboard />} />
      <Route path="/jobs" element={<JobsPage />} />
      <Route path="/jobs/:id" element={<JobDetailPage />} />
      <Route path="/customers" element={<CustomersPage />} />
      <Route path="/customers/:id" element={<CustomerDetailPage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Route>
  </Routes>
)
```

**Benefits:**
- Better user experience
- Bookmarkable pages
- Easier navigation
- Supports future features

### Phase 7: Component Splitting

**Before (Dashboard.tsx - 317 lines):**
```typescript
export const Dashboard = () => {
  // Job state
  // Customer state
  // Job logic
  // Customer logic
  // Job UI
  // Customer UI
}
```

**After:**
```typescript
export const Dashboard = () => {
  const [activeTab, setActiveTab] = useState('jobs')
  
  return (
    <MainLayout>
      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tab value="jobs">Jobs</Tab>
        <Tab value="customers">Customers</Tab>
      </Tabs>
      {activeTab === 'jobs' ? <JobsView /> : <CustomersView />}
    </MainLayout>
  )
}

// Separate components
const JobsView = () => {
  const { jobs, loading, error, createJob, updateJob } = useJobs()
  // Job-specific UI
}

const CustomersView = () => {
  const { customers, loading, error, createCustomer, updateCustomer } = useCustomers()
  // Customer-specific UI
}
```

**Benefits:**
- Easier to understand
- Easier to test
- Easier to modify
- Better performance (can memoize separately)

---

## 📝 Implementation Priority

### High Priority (Do First)
1. ✅ Fix import bug in CustomerModal
2. ✅ Create service layer (jobService, customerService)
3. ✅ Create data hooks (useJobs, useCustomers)
4. ✅ Move Firebase config to environment variables

### Medium Priority (Do Next)
5. Create reusable UI components (Button, FormField, Modal)
6. Split Dashboard into smaller components
7. Implement routing structure
8. Add error boundaries

### Low Priority (Future Improvements)
9. Add form validation utilities
10. Add date/number formatting utilities
11. Create a design system document
12. Add unit tests

---

## 🎨 Design Patterns to Follow

### 1. Single Responsibility Principle
Each component/service should do one thing well.

### 2. Composition over Inheritance
Use composition to build complex UIs from simple components.

### 3. Container/Presentational Pattern
- **Container components**: Handle data and logic (useJobs, useCustomers)
- **Presentational components**: Handle UI rendering

### 4. Custom Hooks for Logic Reuse
Extract common logic into custom hooks.

### 5. Service Layer Pattern
Separate business logic from UI logic.

---

## 🚀 Future Feature Extensibility

With this structure, adding new features becomes easier:

### Example: Adding Equipment Management

1. **Create service**: `services/equipmentService.ts`
2. **Create hook**: `hooks/useEquipment.tsx`
3. **Create components**: `components/equipment/*`
4. **Add route**: `routes/index.tsx`
5. **Add types**: `types/index.ts`

**No need to modify existing code!**

### Example: Adding Reports

1. **Create service**: `services/reportService.ts`
2. **Create hook**: `hooks/useReports.tsx`
3. **Create components**: `components/reports/*`
4. **Add route**: `routes/index.tsx`

---

## 📚 Best Practices

### Component Organization
- Keep components under 200 lines
- Extract complex logic into hooks
- Use TypeScript for type safety
- Add proper error handling

### State Management
- Use React hooks for local state
- Use Context for global state (auth, theme)
- Consider Zustand/Redux for complex state

### Code Quality
- Use ESLint and Prettier
- Write meaningful variable names
- Add comments for complex logic
- Keep functions small and focused

### Performance
- Use React.memo for expensive components
- Use useMemo/useCallback appropriately
- Lazy load routes and components
- Optimize re-renders

---

## 🔍 Migration Strategy

### For Existing Code
1. **No Breaking Changes**: Keep old code working
2. **Gradual Migration**: Move one feature at a time
3. **Side-by-Side**: New and old code coexist temporarily
4. **Test Thoroughly**: Test each migration step

### For New Features
- Use the new structure immediately
- Follow the new patterns
- Don't add to old code

---

## ✅ Checklist for Adding New Features

Before adding a new feature, ask:

- [ ] Do I need a new service?
- [ ] Do I need a new custom hook?
- [ ] Can I reuse existing components?
- [ ] Do I need a new route?
- [ ] Do I need new types?
- [ ] Is my component under 200 lines?
- [ ] Have I separated logic from UI?
- [ ] Is my code testable?

---

## 📖 Additional Resources

- [React Best Practices](https://react.dev/learn)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Firebase Best Practices](https://firebase.google.com/docs/web/setup)
- [Clean Code Principles](https://www.amazon.com/Clean-Code-Handbook-Software-Craftsmanship/dp/0132350882)

---

**Last Updated**: 2025-10-01
**Status**: Phase 1 Complete, Ready for Phase 2

