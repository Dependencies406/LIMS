/**
 * ESLint Rules to Prevent Direct Deletions
 * 
 * This file should be merged into your main .eslintrc.js
 * to enforce the use of centralized deletion service.
 */

module.exports = {
  rules: {
    // Prevent direct deleteDoc imports
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: 'firebase/firestore',
            importNames: ['deleteDoc'],
            message: 'Use firestoreDeletionService instead of direct deleteDoc(). See src/dataLifecycle/README.md',
          },
        ],
        patterns: [
          {
            group: ['**/firebase'],
            importNames: ['deleteDoc'],
            message: 'Use firestoreDeletionService instead of direct deleteDoc(). See src/dataLifecycle/README.md',
          },
        ],
      },
    ],
    
    // Prevent direct deleteDoc calls (if we can detect them)
    'no-restricted-syntax': [
      'error',
      {
        selector: 'CallExpression[callee.name="deleteDoc"]',
        message: 'Use firestoreDeletionService instead of direct deleteDoc(). See src/dataLifecycle/README.md',
      },
      {
        selector: 'CallExpression[callee.property.name="delete"]',
        message: 'Use firestoreDeletionService for Storage deletions. See src/dataLifecycle/README.md',
      },
    ],
  },
};
