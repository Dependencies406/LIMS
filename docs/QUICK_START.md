# Quick Start Guide - Refactored LIMS

This guide shows you how to use the new refactored code structure.

---

## 🚀 Getting Started

### 1. Environment Setup

Copy the environment template and fill in your values:
```bash
# Already done for you, but for reference:
# cp .env.example .env
# Edit .env with your Firebase credentials
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run Development Server
```bash
npm run dev
```

---

## 📘 Using the New Structure

### Custom Hooks - The Easy Way

The easiest way to work with data now is using the custom hooks:

#### Working with Jobs:
```typescript
import { useJobs } from '../hooks/useJobs';

function MyComponent() {
  // Get everything you need in one line
  const { 
    jobs,           // Array of all jobs
    loading,        // Loading state
    error,          // Error message (if any)
    createJob,      // Function to create job
    updateJob,      // Function to update job
    deleteJob,      // Function to delete job
    generateJobId,  // Generate unique job ID
  } = useJobs();

  // Create a job
  const handleCreate = async () => {
    try {
      const jobData = {
        jobId: generateJobId(),
        title: 'Test Job',
        status: 'Pending',
        customerCode: 'CM-25001',
        equipment: [/* equipment data */],
      };
      await createJob(jobData);
      // Success! Jobs will update automatically
    } catch (err) {
      console.error('Failed to create job:', err);
    }
  };

  // Update a job
  const handleUpdate = async (jobId: string) => {
    try {
      await updateJob(jobId, { status: 'Completed' });
      // Success! Jobs will update automatically
    } catch (err) {
      console.error('Failed to update job:', err);
    }
  };

  return (
    <div>
      {loading && <p>Loading...</p>}
      {error && <p>Error: {error}</p>}
      {jobs.map(job => (
        <div key={job.id}>{job.title}</div>
      ))}
    </div>
  );
}
```

#### Working with Customers:
```typescript
import { useCustomers } from '../hooks/useCustomers';

function MyComponent() {
  const { 
    customers,            // Array of all customers
    loading,              // Loading state
    error,                // Error message
    createCustomer,       // Function to create
    updateCustomer,       // Function to update
    deleteCustomer,       // Function to delete
    generateCustomerCode, // Generate unique code
  } = useCustomers();

  // Create a customer
  const handleCreate = async () => {
    try {
      const customerCode = await generateCustomerCode();
      const customerData = {
        customerCode,
        name: 'New Customer',
        contact: 'John Doe',
        address: '123 Main St',
        email: 'john@example.com',
        phone: '123-456-7890',
      };
      await createCustomer(customerData);
      // Success!
    } catch (err) {
      console.error('Failed to create customer:', err);
    }
  };

  return (
    <div>
      {loading && <p>Loading...</p>}
      {customers.map(customer => (
        <div key={customer.id}>{customer.name}</div>
      ))}
    </div>
  );
}
```

---

## 🎨 Using UI Components

### Buttons:
```typescript
import { Button } from '../components/common';

// Primary button
<Button variant="primary" onClick={handleSave}>
  Save
</Button>

// Secondary button
<Button variant="secondary" onClick={handleCancel}>
  Cancel
</Button>

// Danger button
<Button variant="danger" onClick={handleDelete}>
  Delete
</Button>

// With loading state
<Button variant="primary" disabled={loading}>
  {loading ? 'Saving...' : 'Save'}
</Button>

// Full width
<Button variant="primary" fullWidth>
  Submit
</Button>
```

### Form Fields:
```typescript
import { FormField, Input, Select, Textarea } from '../components/common';

// Text input
<FormField label="Name" required error={errors.name}>
  <Input 
    value={name}
    onChange={e => setName(e.target.value)}
    placeholder="Enter name"
    error={!!errors.name}
  />
</FormField>

// Textarea
<FormField label="Description">
  <Textarea 
    value={description}
    onChange={e => setDescription(e.target.value)}
    rows={4}
  />
</FormField>

// Select dropdown
<FormField label="Status" required>
  <Select 
    value={status}
    onChange={e => setStatus(e.target.value)}
  >
    <option value="">Select status</option>
    <option value="Pending">Pending</option>
    <option value="In Progress">In Progress</option>
    <option value="Completed">Completed</option>
  </Select>
</FormField>
```

### Modals:
```typescript
import { Modal, ModalFooter, Button } from '../components/common';

function MyComponent() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        Open Modal
      </Button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Edit Item"
        maxWidth="lg"
      >
        {/* Modal content */}
        <div>
          <p>Your form or content here</p>
        </div>

        <ModalFooter>
          <Button 
            variant="secondary" 
            onClick={() => setIsOpen(false)}
          >
            Cancel
          </Button>
          <Button 
            variant="primary" 
            onClick={handleSave}
          >
            Save
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
```

### Cards:
```typescript
import { Card } from '../components/common';

// Simple card
<Card>
  <h3>Title</h3>
  <p>Content</p>
</Card>

// Clickable card
<Card onClick={() => handleClick(item)} hoverable>
  <h3>{item.title}</h3>
  <p>{item.description}</p>
</Card>
```

### Loading Spinner:
```typescript
import { LoadingSpinner } from '../components/common';

// Default loading
<LoadingSpinner />

// With custom message
<LoadingSpinner message="Loading jobs..." />

// Full screen
<LoadingSpinner fullScreen message="Please wait..." />

// Different sizes
<LoadingSpinner size="sm" />
<LoadingSpinner size="md" />
<LoadingSpinner size="lg" />
```

---

## 🔧 Direct Service Usage (Advanced)

If you need more control, you can use services directly:

```typescript
import { jobService } from '../services/jobService';
import { customerService } from '../services/customerService';

// Get all jobs (one-time fetch)
const jobs = await jobService.getAllJobs();

// Get single job
const job = await jobService.getJobById('job-123');

// Subscribe to real-time updates
const unsubscribe = jobService.subscribeToJobs((jobs, error) => {
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Jobs updated:', jobs);
  }
});

// Don't forget to unsubscribe!
// Call unsubscribe() when component unmounts

// Search and filter
const filteredJobs = jobService.searchJobs(jobs, 'search term');
const pendingJobs = jobService.filterJobsByStatus(jobs, 'Pending');
```

---

## 📦 Importing Components

### Single import:
```typescript
import { Button } from '../components/common';
```

### Multiple imports:
```typescript
import { 
  Button, 
  Input, 
  FormField, 
  Modal,
  Card 
} from '../components/common';
```

---

## ✅ Best Practices

### 1. Use Hooks for Data
✅ **Do this:**
```typescript
const { jobs, loading, createJob } = useJobs();
```

❌ **Avoid this:**
```typescript
const [jobs, setJobs] = useState([]);
// ... manual Firebase code
```

### 2. Use Common Components
✅ **Do this:**
```typescript
<Button variant="primary">Save</Button>
```

❌ **Avoid this:**
```typescript
<button className="btn btn-primary">Save</button>
```

### 3. Handle Errors Properly
✅ **Do this:**
```typescript
try {
  await createJob(data);
  showSuccess('Job created!');
} catch (err) {
  showError('Failed to create job');
  console.error(err);
}
```

### 4. Use TypeScript Types
✅ **Do this:**
```typescript
import type { Job, Customer } from '../types';

const job: Job = { /* ... */ };
```

---

## 🎯 Common Patterns

### Loading State:
```typescript
const { jobs, loading } = useJobs();

if (loading) {
  return <LoadingSpinner />;
}

return <JobList jobs={jobs} />;
```

### Error Handling:
```typescript
const { jobs, error } = useJobs();

if (error) {
  return <div>Error: {error}</div>;
}
```

### Form with Validation:
```typescript
const [form, setForm] = useState({ name: '', email: '' });
const [errors, setErrors] = useState({});
const { createCustomer } = useCustomers();

const handleSubmit = async (e) => {
  e.preventDefault();
  
  // Validate
  const newErrors = {};
  if (!form.name) newErrors.name = 'Name is required';
  if (!form.email) newErrors.email = 'Email is required';
  
  if (Object.keys(newErrors).length > 0) {
    setErrors(newErrors);
    return;
  }
  
  // Submit
  try {
    await createCustomer(form);
    // Success!
  } catch (err) {
    // Handle error
  }
};
```

---

## 🚀 Next Steps

1. **Start using hooks** in your components
2. **Replace inline styles** with common components
3. **Review examples** in existing code
4. **Check documentation** in `REFACTORING_GUIDE.md`

---

**Happy Coding! 🎉**

