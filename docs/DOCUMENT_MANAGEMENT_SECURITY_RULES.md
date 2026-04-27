# Firestore Security Rules for Document Management System

## Quick Setup

To fix the "Missing or insufficient permissions" error, you need to update your Firestore security rules in the Firebase Console.

### Steps:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Firestore Database** → **Rules**
4. Copy the rules from `docs/firebase-security-rules-complete.txt`
5. Paste them into the rules editor
6. Click **Publish**

## Security Rules Explanation

### Documents Collection

The `documents` collection has role-based access control:

- **Published Documents**: All authenticated users can read
- **Obsolete Documents**: All authenticated users can read (for reference)
- **Draft/Review Documents**: 
  - Admins and staff can read
  - Assigned reviewers/approvers can read
  - Regular users (viewers) cannot see draft/review documents
- **Write Access**: Only admins and staff can create/update/delete documents
- **Assigned Users**: Reviewers and approvers can update documents assigned to them

### Notifications Collection

- Users can only read their own notifications
- Only authenticated users can create notifications
- Users can update/delete their own notifications

## Testing the Rules

After updating the rules, test by:

1. Logging in as an admin - should see all documents
2. Logging in as a regular user - should only see published documents
3. Creating a document as admin - should work
4. Viewing master list - should work for all authenticated users

## Troubleshooting

If you still get permission errors:

1. **Check user role**: Ensure users have a `role` field in their user document (`admin` or `staff`)
2. **Verify authentication**: Make sure users are logged in
3. **Check Firestore indexes**: Some queries may need composite indexes (Firebase will prompt you)
4. **Wait for propagation**: Security rules can take a few seconds to propagate

## Required Firestore Indexes

The following composite indexes may be needed (Firebase will auto-prompt):

1. `documents` collection:
   - `state` (Ascending) + `isCurrentVersion` (Ascending) + `documentId` (Ascending)
   - `documentId` (Ascending) + `createdAt` (Descending)

2. `documents` collection (for Master List):
   - `state` (Ascending) + `isCurrentVersion` (Ascending) + `documentId` (Ascending)

If Firebase prompts you to create these indexes, click the link in the error message to create them automatically.

