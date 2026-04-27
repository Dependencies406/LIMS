/**
 * Create .env.example file
 * This script creates the .env.example template file
 */

import * as fs from 'fs';
import * as path from 'path';

const envExampleContent = `# Firebase Configuration Template
# Copy this file to .env and fill in your Firebase credentials
# DO NOT commit .env to version control

# Get these values from Firebase Console:
# 1. Go to Project Settings
# 2. Scroll to "Your apps" section
# 3. Click on Web app icon (</>) or create a new web app
# 4. Copy the configuration values

VITE_FIREBASE_API_KEY=your-api-key-here
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_FIREBASE_MEASUREMENT_ID=your-measurement-id-optional
`;

const envExamplePath = path.join(process.cwd(), '.env.example');

try {
  fs.writeFileSync(envExamplePath, envExampleContent);
  console.log('✓ Created .env.example file');
  console.log(`  Location: ${envExamplePath}`);
} catch (error) {
  console.error('Failed to create .env.example:', error);
  process.exit(1);
}
