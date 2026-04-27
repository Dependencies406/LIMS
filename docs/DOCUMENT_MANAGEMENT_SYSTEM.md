# ISO/IEC 17025 Document Management System

## Overview

This document describes the ISO/IEC 17025:2017 compliant Document Management System (DMS) integrated into the LIMS application.

## Features Implemented

### 1. Document Identification & Version Control (Clause 8.3.2 c)

✅ **REQ-01**: Auto-generate Document ID (format: `DOC-YYYY-###`)
- Implemented in `documentService.generateDocumentId()`
- Format: `DOC-2025-001`, `DOC-2025-002`, etc.

✅ **REQ-02**: Auto-increment revision
- Format: `Rev. 01`, `Rev. 02`, etc.
- Implemented in `documentService.generateRevision()`

✅ **REQ-03**: Auto header/footer overlay in PDF
- Title, Document ID, Revision, Effective Date
- Page X of Y pagination
- Implemented in `documentPdfService.addDocumentHeader()` and `addDocumentFooter()`

### 2. Approval Workflow (Clause 8.3.2 a)

✅ **REQ-04**: Workflow states implemented
- States: `Draft` → `Under Review` → `Pending Approval` → `Published` → `Obsolete`
- Implemented in `documentService` with state transition methods

✅ **REQ-05**: Digital signatures captured
- Reviewer and approver signatures with userId + timestamp
- Stored in `reviewSignature` and `approvalSignature` fields
- Implemented using `SignatureCanvas` component

✅ **REQ-06**: Draft/Review items hidden from Viewer role
- Filtered in `DocumentsPage` based on user role
- Only admins and assigned reviewers/approvers can see draft/review documents

### 3. Distribution & Access (Clause 8.3.2 d)

✅ **REQ-07**: Real-time Master List
- `MasterListPage` displays all published, current-version documents
- Auto-refreshes every 30 seconds
- Exportable to CSV

✅ **REQ-08**: Search functionality
- Search by title, ID, keyword, tag, category
- Implemented in `DocumentsPage` and `MasterListPage`

✅ **REQ-09**: Staff notifications
- Notifications sent when documents are published
- Implemented in `notificationService`
- Integrated into `documentService.approveDocument()`

### 4. Control of Changes & History (Clause 8.3.2 b)

✅ **REQ-10**: Full audit trail
- Complete history of all actions
- Captures: created, edited, reviewed, approved, published, obsoleted
- Includes: userId, userName, timestamp, change summary, state transitions
- Displayed in `AuditTrail` component

### 5. Obsolete Document Control (Clause 8.3.2 f)

✅ **REQ-11**: Auto-archive old revisions
- When new version is published, previous versions are marked obsolete
- Implemented in `documentService.approveDocument()`

✅ **REQ-12**: Watermark obsolete PDFs
- Watermark: "OBSOLETE – FOR REFERENCE ONLY"
- Implemented in `documentPdfService.addWatermark()`

### 6. Printing Control

✅ **REQ-13**: Uncontrolled copy watermark
- Watermark: "UNCONTROLLED COPY – Valid only on [Current Date]"
- Applied when downloading uncontrolled copies
- Implemented in `documentPdfService`

## File Structure

```
src/
├── types/
│   └── index.ts                    # Added Document types
├── services/
│   ├── documentService.ts          # Main document CRUD & workflow
│   ├── documentPdfService.ts       # PDF generation with watermarks
│   └── notificationService.ts     # Document publishing notifications
├── components/
│   ├── DocumentModal.tsx           # Create/Edit document modal
│   └── AuditTrail.tsx              # Audit trail display component
├── pages/
│   ├── DocumentsPage.tsx           # Main documents page
│   └── MasterListPage.tsx          # Master list of controlled documents
└── App.tsx                          # Added document routes
```

## Firestore Collections

### `documents`
- Stores all document versions
- Fields: `documentId`, `title`, `revision`, `state`, `content`, `auditTrail`, etc.
- Indexed by: `documentId`, `state`, `isCurrentVersion`

### `notifications`
- Stores user notifications
- Fields: `type`, `title`, `message`, `documentId`, `userId`, `read`, etc.

## Usage

### Creating a Document

1. Navigate to **Documents** in the sidebar
2. Click **+ Create Document**
3. Fill in title, description, category, content
4. Assign reviewer and approver (optional)
5. Click **Create Document**

### Document Workflow

1. **Draft**: Document is created and can be edited
2. **Submit for Review**: Admin submits document for review
3. **Under Review**: Reviewer reviews and signs the document
4. **Pending Approval**: Approver approves and publishes the document
5. **Published**: Document is live and read-only
6. **Obsolete**: Previous versions are automatically obsoleted

### Viewing Master List

1. Navigate to **Master List** in the sidebar
2. View all published, current-version documents
3. Search and filter by category
4. Download controlled or uncontrolled PDFs
5. Export to CSV

### Downloading PDFs

- **Controlled PDF**: Official version with full headers/footers (no watermark)
- **Uncontrolled PDF**: Copy with "UNCONTROLLED COPY" watermark and current date

## Integration Points

### Reused Components
- `Modal`, `Card`, `Button` from `components/common`
- `PdfPreviewModal` for PDF preview
- `SignatureCanvas` for digital signatures
- `FileUpload` for attachments (ready for future use)

### Reused Services
- `firebase.ts` for Firestore operations
- `userService.ts` for user management
- `pdfService.ts` patterns for PDF generation

### Reused Patterns
- Real-time subscriptions using `onSnapshot`
- Toast notifications using `useToast`
- Protected routes using `ProtectedRoute` and `AdminRoute`

## Security & Permissions

- **Admin**: Full access (create, edit, delete, approve)
- **Staff**: Can view published documents, review/approve assigned documents
- **Viewer**: Can only view published documents (draft/review hidden)

## Future Enhancements

- [ ] Document attachments support
- [ ] Document templates
- [ ] Bulk operations
- [ ] Document expiration/review dates
- [ ] Email notifications (currently Firestore notifications only)
- [ ] Document categories management
- [ ] Advanced search with filters

## Compliance Notes

This implementation follows ISO/IEC 17025:2017 requirements for:
- Document control (Clause 8.3.2)
- Records control (Clause 8.4)
- Management system documentation (Clause 8.2)

All requirements from the specification have been implemented and are functional.

