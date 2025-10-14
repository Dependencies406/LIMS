# 🚀 LIMS Quick Reference Guide

Quick reference for using the new features.

---

## 📄 PDF Generation

### **Generate PDF Immediately**
```typescript
import { generateAndDownloadJobPDF } from '../services/pdfService';

await generateAndDownloadJobPDF(job);
```

### **Generate PDF with Custom Settings**
```typescript
await generateAndDownloadJobPDF(job, {
  pageSize: 'A4',
  orientation: 'portrait',
  showHeader: true,
  showFooter: true,
  fontSize: {
    title: 16,
    heading: 12,
    body: 10,
    small: 8
  }
});
```

### **Generate PDF Preview**
```typescript
import { generatePDFPreview } from '../services/pdfService';

const previewUrl = await generatePDFPreview(job, settings);
// Use in iframe: <iframe src={previewUrl} />
```

---

## 📊 Export Data

### **Export Jobs to CSV**
```typescript
import { exportService } from '../services/exportService';

// Export all jobs
exportService.exportJobsToCSV(jobs);

// Export filtered jobs
exportService.exportJobsToCSV(filteredJobs);
```

### **Export Customers to CSV**
```typescript
exportService.exportCustomersToCSV(customers);
```

### **Export Equipment List**
```typescript
exportService.exportEquipmentToCSV(job.equipment, job.jobId);
```

### **Export Job with Full Details**
```typescript
exportService.exportJobDetailsToCSV(job);
```

### **Generate Summary Report**
```typescript
// Get report as string
const report = exportService.generateSummaryReport(jobs);

// Download report as file
exportService.exportSummaryReport(jobs);
```

### **Export to JSON**
```typescript
exportService.exportToJSON(data, 'filename.json');
```

---

## 📎 File Upload

### **Upload Single File**
```typescript
import { uploadJobAttachment } from '../services/fileUploadService';

const metadata = await uploadJobAttachment(
  jobId,
  file,
  userId,
  (progress) => {
    console.log(`${progress.percentage}% complete`);
  }
);
```

### **Upload Multiple Files**
```typescript
import { uploadMultipleFiles } from '../services/fileUploadService';

const metadataArray = await uploadMultipleFiles(
  files,
  `jobs/${jobId}/attachments`,
  (fileIndex, progress) => {
    console.log(`File ${fileIndex}: ${progress.percentage}%`);
  }
);
```

### **Delete File**
```typescript
import { deleteJobAttachment } from '../services/fileUploadService';

await deleteJobAttachment(filePath);
```

### **Validate File Before Upload**
```typescript
import { validateFile } from '../services/fileUploadService';

const validation = validateFile(file, {
  maxSize: 10 * 1024 * 1024, // 10MB
  allowedTypes: ['.pdf', '.jpg', '.png']
});

if (!validation.valid) {
  console.error(validation.error);
}
```

### **Use FileUpload Component**
```typescript
import { FileUpload } from './components/FileUpload';

<FileUpload
  onUpload={async (files) => {
    for (const file of files) {
      const metadata = await uploadJobAttachment(jobId, file, userId);
      // Save metadata to job document
    }
  }}
  onDelete={async (fileId) => {
    await deleteJobAttachment(fileId);
    // Update job document
  }}
  existingFiles={job.attachments}
  multiple={true}
  maxSize={10 * 1024 * 1024}
  allowedTypes={['.pdf', '.doc', '.docx', '.jpg', '.png']}
/>
```

---

## 🎨 UI Components

### **PDF Settings Modal**
```typescript
import { PdfSettingsModal } from './components/PdfSettingsModal';

const [showPdfSettings, setShowPdfSettings] = useState(false);
const [pdfSettings, setPdfSettings] = useState({});

<PdfSettingsModal
  isOpen={showPdfSettings}
  onClose={() => setShowPdfSettings(false)}
  onSave={setPdfSettings}
  initialSettings={pdfSettings}
/>
```

### **PDF Preview Modal**
```typescript
import { PdfPreviewModal } from './components/PdfPreviewModal';

const [showPdfPreview, setShowPdfPreview] = useState(false);

<PdfPreviewModal
  isOpen={showPdfPreview}
  onClose={() => setShowPdfPreview(false)}
  job={job}
  settings={pdfSettings}
  onDownload={handleGeneratePDF}
/>
```

---

## 🔧 Utilities

### **Format File Size**
```typescript
import { formatFileSize } from '../services/fileUploadService';

formatFileSize(1024);           // "1 KB"
formatFileSize(1048576);        // "1 MB"
formatFileSize(1073741824);     // "1 GB"
```

### **Get File Icon**
```typescript
import { getFileIcon } from '../services/fileUploadService';

getFileIcon('application/pdf');     // "📄"
getFileIcon('image/jpeg');          // "🖼️"
getFileIcon('application/zip');     // "📦"
```

---

## 🎯 Common Use Cases

### **1. Download Job PDF**
```typescript
// In your component
const handleDownloadPDF = async () => {
  try {
    await generateAndDownloadJobPDF(job, pdfSettings);
    showSuccess('PDF downloaded successfully');
  } catch (error) {
    showError('Failed to generate PDF');
  }
};
```

### **2. Export with Filters**
```typescript
// Export only completed jobs
const completedJobs = jobs.filter(j => j.status === 'Completed');
exportService.exportJobsToCSV(completedJobs);
```

### **3. Upload File with Progress**
```typescript
const [uploadProgress, setUploadProgress] = useState(0);

const handleUpload = async (file: File) => {
  const metadata = await uploadJobAttachment(
    jobId,
    file,
    userId,
    (progress) => setUploadProgress(progress.percentage)
  );
  
  // Update job with attachment metadata
  await updateDoc(doc(db, 'jobs', jobId), {
    attachments: arrayUnion(metadata)
  });
};
```

### **4. Custom PDF Settings**
```typescript
const customSettings = {
  templateName: 'Lab Report',
  pageSize: 'A4',
  orientation: 'portrait',
  showHeader: true,
  showFooter: true,
  fontSize: {
    title: 18,
    heading: 14,
    body: 11,
    small: 9
  },
  margin: {
    top: 50,
    right: 50,
    bottom: 50,
    left: 50
  },
  fieldVisibility: {
    'serialNumber': { visible: true },
    'accessories': { visible: false }
  }
};

await generateAndDownloadJobPDF(job, customSettings);
```

---

## ⚡ Performance Tips

### **PDF Generation**
- Generate PDFs in background if possible
- Show loading indicator during generation
- Cache PDF settings per user

### **File Uploads**
- Validate files before upload
- Show progress for large files
- Implement retry logic for failed uploads
- Use compression for large images

### **Exports**
- Filter data before export (faster)
- Use CSV for Excel compatibility
- Use JSON for data backup/transfer

---

## 🐛 Error Handling

### **PDF Generation**
```typescript
try {
  await generateAndDownloadJobPDF(job, settings);
} catch (error) {
  if (error instanceof Error) {
    console.error('PDF Error:', error.message);
    showError(`Failed to generate PDF: ${error.message}`);
  }
}
```

### **File Upload**
```typescript
try {
  const validation = validateFile(file, options);
  if (!validation.valid) {
    showError(validation.error);
    return;
  }
  
  const metadata = await uploadJobAttachment(jobId, file, userId);
  showSuccess('File uploaded successfully');
} catch (error) {
  console.error('Upload Error:', error);
  showError('Failed to upload file. Please try again.');
}
```

### **Export**
```typescript
try {
  exportService.exportJobsToCSV(jobs);
  showSuccess('Data exported successfully');
} catch (error) {
  console.error('Export Error:', error);
  showError('Failed to export data');
}
```

---

## 📱 Mobile Considerations

### **PDF Preview**
- Use download on mobile (iframe may not work)
- Provide direct download link
- Consider smaller page sizes

### **File Upload**
- Mobile camera access for photos
- Smaller file size limits
- Touch-friendly drag-and-drop area

### **Export**
- Provide multiple format options
- Consider mobile-friendly viewers
- Use share API on mobile

---

## 🔐 Security Best Practices

### **File Upload**
```typescript
// Always validate files
const validation = validateFile(file, {
  maxSize: 10 * 1024 * 1024, // 10MB max
  allowedTypes: ['.pdf', '.jpg', '.png'] // Only allow specific types
});

// Include user ID in uploads
const metadata = await uploadJobAttachment(jobId, file, currentUser.uid);
```

### **PDF Generation**
```typescript
// Only allow authenticated users
if (!currentUser) {
  showError('You must be logged in');
  return;
}

// Check permissions for job access
if (job.createdBy !== currentUser.uid && !isAdmin) {
  showError('You do not have permission to generate PDF for this job');
  return;
}
```

---

## 📚 Type Definitions

### **FileAttachment**
```typescript
interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  uploadedAt: Date;
  uploadedBy: string;
}
```

### **PdfSettings**
```typescript
interface PdfSettings {
  templateName: string;
  pageSize: 'A4' | 'Letter';
  orientation: 'portrait' | 'landscape';
  layout: 'traditional' | 'grid';
  fontSize: {
    title: number;
    heading: number;
    body: number;
    small: number;
  };
  margin: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  fieldVisibility: FieldVisibility;
  showLogo: boolean;
  showHeader: boolean;
  showFooter: boolean;
}
```

### **UploadProgress**
```typescript
interface UploadProgress {
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
}
```

---

## 🎓 Examples

See the following files for complete examples:
- `src/components/Dashboard.tsx` - Export integration
- `src/components/JobModal.tsx` - PDF & export buttons
- `src/services/pdfService.ts` - PDF generation
- `src/services/exportService.ts` - Export functions
- `src/services/fileUploadService.ts` - File upload

---

**Need More Help?**
- Check JSDoc comments in service files
- Review component implementation
- See `NEW_FEATURES_COMPLETE.md` for detailed documentation


