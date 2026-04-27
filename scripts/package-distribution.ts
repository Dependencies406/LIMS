/**
 * Distribution Package Builder
 * 
 * This script creates a distribution package for commercial deployment
 * that can be installed on any Firebase project.
 */

import * as fs from 'fs';
import * as path from 'path';

const DIST_DIR = path.join(process.cwd(), 'dist-package');
const DIST_APP_DIR = path.join(DIST_DIR, 'lims-app');
const DIST_TOOL_DIR = path.join(DIST_DIR, 'firebase-setup-tool');

// Files and directories to include in the distribution
const FILES_TO_COPY = [
  { src: 'dist', dest: 'lims-app/dist', description: 'Built web application' },
  { src: 'firestore.rules', dest: 'lims-app/firestore.rules', description: 'Firestore security rules' },
  { src: 'storage.rules', dest: 'lims-app/storage.rules', description: 'Storage security rules' },
  { src: 'firestore.indexes.json', dest: 'lims-app/firestore.indexes.json', description: 'Firestore indexes' },
  { src: 'firebase.json', dest: 'lims-app/firebase.json', description: 'Firebase configuration' },
  { src: 'package.json', dest: 'lims-app/package.json', description: 'Package configuration' },
];

// Directories to copy recursively
const DIRS_TO_COPY = [
  { src: 'firebase-setup-tool', dest: 'firebase-setup-tool', description: 'Python setup tool' },
  { src: 'docs/COMMERCIAL_DISTRIBUTION_SETUP.md', dest: 'SETUP_GUIDE.md', description: 'Setup guide' },
  { src: 'docs/INSTALLATION_GUIDE.md', dest: 'INSTALLATION_GUIDE.md', description: 'Installation guide' },
];

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyFile(src: string, dest: string) {
  const destDir = path.dirname(dest);
  ensureDir(destDir);
  
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`✓ Copied: ${src} → ${dest}`);
    return true;
  } else {
    console.warn(`⚠ Skipped (not found): ${src}`);
    return false;
  }
}

function copyDir(src: string, dest: string) {
  if (!fs.existsSync(src)) {
    console.warn(`⚠ Skipped (not found): ${src}`);
    return false;
  }

  ensureDir(dest);
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  }
  
  return true;
}

function createReadme() {
  const readmeContent = `# LIMS Application Distribution Package

This package contains everything needed to install and configure the LIMS application on a new Firebase project.

## Package Contents

- \`lims-app/\` - The web application files
- \`firebase-setup-tool/\` - Python tool for configuring Firebase credentials
- \`SETUP_GUIDE.md\` - Step-by-step Firebase Console setup instructions
- \`INSTALLATION_GUIDE.md\` - Installation and deployment instructions

## Quick Start

1. **Set up Firebase Project** (see SETUP_GUIDE.md)
   - Create a new Firebase project
   - Enable Authentication, Firestore, and Storage
   - Get your Firebase configuration credentials

2. **Configure Application**
   - Run the Python setup tool: \`python firebase-setup-tool/main.py\`
   - Enter your Firebase credentials
   - The tool will generate the \`.env\` file

3. **Deploy Security Rules**
   - Navigate to \`lims-app/\` directory
   - Deploy Firestore rules: \`firebase deploy --only firestore:rules\`
   - Deploy Storage rules: \`firebase deploy --only storage:rules\`
   - Deploy indexes: \`firebase deploy --only firestore:indexes\`

4. **Build and Deploy**
   - Install dependencies: \`npm install\`
   - Build application: \`npm run build\`
   - Deploy to Firebase Hosting: \`firebase deploy --only hosting\`

For detailed instructions, see INSTALLATION_GUIDE.md

## Support

For issues or questions, refer to the documentation files included in this package.
`;

  fs.writeFileSync(path.join(DIST_DIR, 'README.md'), readmeContent);
  console.log('✓ Created README.md');
}

function createInstallScript() {
  // Windows batch script
  const installBat = `@echo off
echo ========================================
echo LIMS Application Installation Script
echo ========================================
echo.

echo Step 1: Setting up Firebase configuration...
cd lims-app
if not exist .env (
    echo.
    echo Please run the Firebase setup tool first!
    echo Navigate to firebase-setup-tool and run: python main.py
    echo.
    pause
    exit /b 1
)

echo.
echo Step 2: Installing dependencies...
call npm install
if errorlevel 1 (
    echo Failed to install dependencies!
    pause
    exit /b 1
)

echo.
echo Step 3: Building application...
call npm run build
if errorlevel 1 (
    echo Failed to build application!
    pause
    exit /b 1
)

echo.
echo Step 4: Deploying Firebase rules and indexes...
echo Please ensure you are logged into Firebase CLI: firebase login
echo.
echo Deploying Firestore rules...
call firebase deploy --only firestore:rules
echo.
echo Deploying Storage rules...
call firebase deploy --only storage:rules
echo.
echo Deploying Firestore indexes...
call firebase deploy --only firestore:indexes

echo.
echo Step 5: Deploying to Firebase Hosting...
echo Do you want to deploy to Firebase Hosting now? (Y/N)
set /p deploy="> "
if /i "%deploy%"=="Y" (
    call firebase deploy --only hosting
)

echo.
echo ========================================
echo Installation complete!
echo ========================================
pause
`;

  fs.writeFileSync(path.join(DIST_DIR, 'install.bat'), installBat);
  console.log('✓ Created install.bat');

  // Linux/Mac shell script
  const installSh = `#!/bin/bash

echo "========================================"
echo "LIMS Application Installation Script"
echo "========================================"
echo ""

echo "Step 1: Setting up Firebase configuration..."
cd lims-app
if [ ! -f .env ]; then
    echo ""
    echo "Please run the Firebase setup tool first!"
    echo "Navigate to firebase-setup-tool and run: python3 main.py"
    echo ""
    exit 1
fi

echo ""
echo "Step 2: Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "Failed to install dependencies!"
    exit 1
fi

echo ""
echo "Step 3: Building application..."
npm run build
if [ $? -ne 0 ]; then
    echo "Failed to build application!"
    exit 1
fi

echo ""
echo "Step 4: Deploying Firebase rules and indexes..."
echo "Please ensure you are logged into Firebase CLI: firebase login"
echo ""
echo "Deploying Firestore rules..."
firebase deploy --only firestore:rules
echo ""
echo "Deploying Storage rules..."
firebase deploy --only storage:rules
echo ""
echo "Deploying Firestore indexes..."
firebase deploy --only firestore:indexes

echo ""
echo "Step 5: Deploying to Firebase Hosting..."
read -p "Do you want to deploy to Firebase Hosting now? (y/n) " deploy
if [ "$deploy" = "y" ] || [ "$deploy" = "Y" ]; then
    firebase deploy --only hosting
fi

echo ""
echo "========================================"
echo "Installation complete!"
echo "========================================"
`;

  fs.writeFileSync(path.join(DIST_DIR, 'install.sh'), installSh);
  // Make it executable on Unix systems
  try {
    fs.chmodSync(path.join(DIST_DIR, 'install.sh'), 0o755);
  } catch (e) {
    // Ignore on Windows
  }
  console.log('✓ Created install.sh');
}

async function buildPackage() {
  console.log('🚀 Building distribution package...\n');

  // Check if dist directory exists
  const distPath = path.join(process.cwd(), 'dist');
  if (!fs.existsSync(distPath)) {
    console.warn('⚠️  WARNING: dist/ directory not found!');
    console.warn('   The application needs to be built before packaging.');
    console.warn('   You can build it using one of these methods:');
    console.warn('   1. npm run build (requires TypeScript to compile)');
    console.warn('   2. npx vite build (builds without TypeScript checking)');
    console.warn('');
    console.warn('   Attempting to continue anyway...\n');
  } else {
    console.log('✓ Found dist/ directory\n');
  }

  // Clean and create distribution directory
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }
  ensureDir(DIST_DIR);
  ensureDir(DIST_APP_DIR);

  // Copy files
  console.log('\n📦 Copying files...\n');
  for (const item of FILES_TO_COPY) {
    const srcPath = path.join(process.cwd(), item.src);
    const destPath = path.join(DIST_DIR, item.dest);
    
    // Handle directories differently
    if (fs.existsSync(srcPath) && fs.statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  }
  
  // Create .env.example file in the package
  console.log('\n📝 Creating .env.example...\n');
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
  const envExamplePath = path.join(DIST_DIR, 'lims-app', '.env.example');
  ensureDir(path.dirname(envExamplePath));
  fs.writeFileSync(envExamplePath, envExampleContent);
  console.log('✓ Created .env.example');

  // Copy directories
  console.log('\n📁 Copying directories...\n');
  for (const item of DIRS_TO_COPY) {
    const srcPath = path.join(process.cwd(), item.src);
    const destPath = path.join(DIST_DIR, item.dest);
    
    if (fs.existsSync(srcPath)) {
      if (fs.statSync(srcPath).isDirectory()) {
        copyDir(srcPath, destPath);
      } else {
        copyFile(srcPath, destPath);
      }
    } else {
      console.warn(`⚠ Skipped (not found): ${item.src}`);
    }
  }

  // Create README
  console.log('\n📝 Creating documentation...\n');
  createReadme();

  // Create install scripts
  console.log('\n🔧 Creating install scripts...\n');
  createInstallScript();

  console.log('\n✅ Distribution package created successfully!');
  console.log(`\n📦 Package location: ${DIST_DIR}`);
  console.log('\nNext steps:');
  console.log('1. Review the package contents');
  console.log('2. Test the installation process');
  console.log('3. Create a zip/tar archive for distribution');
}

// Run the build
buildPackage().catch(console.error);
