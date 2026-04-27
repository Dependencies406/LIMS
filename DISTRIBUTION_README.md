# LIMS Application - Commercial Distribution Package

This document explains how to create and distribute the LIMS application as a commercial package.

## Overview

The distribution system allows you to:
- Package the application for easy installation on any Firebase project
- Provide a simple configuration tool for end users
- Include all necessary documentation and setup guides

## Creating a Distribution Package

### Prerequisites

1. Ensure the application is built:
   ```bash
   npm run build
   ```

2. Create .env.example file (if not exists):
   ```bash
   npm run create-env-example
   ```

### Build the Package

Run the packaging script:

```bash
npm run package
```

This will:
1. Build the application (if not already built)
2. Create a `dist-package/` directory
3. Copy all necessary files
4. Include the Firebase setup tool
5. Include documentation
6. Create installation scripts

### Package Contents

The `dist-package/` directory will contain:

```
dist-package/
├── README.md                          # Package overview
├── INSTALLATION_GUIDE.md              # Installation instructions
├── SETUP_GUIDE.md                     # Firebase setup guide
├── install.bat                        # Windows installation script
├── install.sh                         # Linux/Mac installation script
├── lims-app/                          # Application files
│   ├── dist/                          # Built web application
│   ├── firestore.rules                # Firestore security rules
│   ├── storage.rules                  # Storage security rules
│   ├── firestore.indexes.json         # Firestore indexes
│   ├── firebase.json                  # Firebase configuration
│   ├── package.json                   # Dependencies
│   └── .env.example                   # Environment template
└── firebase-setup-tool/               # Python configuration tool
    ├── main.py                        # GUI application
    ├── requirements.txt               # Python dependencies
    └── README.md                      # Tool documentation
```

## Distributing the Package

### Option 1: ZIP Archive

1. **Create ZIP file**:
   ```bash
   # Windows (PowerShell)
   Compress-Archive -Path dist-package -DestinationPath lims-distribution-v1.0.zip
   
   # Linux/Mac
   zip -r lims-distribution-v1.0.zip dist-package/
   ```

2. **Distribute the ZIP file** to your customers

### Option 2: Git Repository

1. Create a new repository for distribution
2. Copy contents of `dist-package/` to the repository
3. Add a LICENSE file
4. Tag releases: `git tag v1.0.0`

### Option 3: Cloud Storage

Upload the package to:
- Google Drive
- Dropbox
- AWS S3
- Azure Blob Storage
- Or your preferred cloud storage

## Version Management

When creating a new version:

1. **Update version** in `package.json`
2. **Update changelog** (create `CHANGELOG.md` if needed)
3. **Rebuild package**: `npm run package`
4. **Create archive** with version number: `lims-distribution-v1.1.zip`
5. **Tag release** in version control

## Customer Installation Process

Your customers will:

1. **Extract the package**
2. **Set up Firebase project** (using `SETUP_GUIDE.md`)
3. **Run the setup tool** (`firebase-setup-tool/main.py`)
4. **Follow installation guide** (`INSTALLATION_GUIDE.md`)
5. **Deploy the application**

## Customization

### Branding

To customize for different customers:

1. **Before packaging**, modify:
   - Application name in `package.json`
   - Logo/images in `public/` directory
   - Company information defaults

2. **Rebuild**:
   ```bash
   npm run build
   npm run package
   ```

### Configuration

The package includes:
- Default security rules (can be customized)
- Default Firestore indexes (can be customized)
- Default Firebase configuration template

## Testing the Package

Before distributing:

1. **Test on clean environment**:
   - Extract package to new directory
   - Follow installation guide
   - Verify all features work

2. **Test setup tool**:
   - Run `firebase-setup-tool/main.py`
   - Verify .env generation works
   - Test with sample credentials

3. **Test installation scripts**:
   - Run `install.bat` or `install.sh`
   - Verify all steps complete successfully

## Support Materials

Include with distribution:

1. **Documentation**:
   - `SETUP_GUIDE.md` - Firebase Console setup
   - `INSTALLATION_GUIDE.md` - Installation steps
   - `README.md` - Package overview

2. **Support Information**:
   - Contact email/support portal
   - Documentation website
   - Video tutorials (if available)

## Security Considerations

1. **Never include**:
   - `.env` files with real credentials
   - `node_modules/` directory
   - Source code (unless open source)

2. **Always include**:
   - Security rules files
   - Documentation
   - Setup tools

3. **Verify**:
   - No sensitive data in package
   - All credentials are placeholders
   - Security rules are production-ready

## Troubleshooting

### Package Build Fails

- Ensure `dist/` directory exists (run `npm run build` first)
- Check that all source files exist
- Verify file permissions

### Missing Files in Package

- Check `package-distribution.ts` for file paths
- Ensure files are not in `.gitignore`
- Verify file existence before packaging

### Large Package Size

- Exclude `node_modules/` (customers will run `npm install`)
- Exclude source maps if not needed
- Compress assets before packaging

## Next Steps

After creating the package:

1. **Test thoroughly** on clean environment
2. **Create distribution archive** (ZIP/tar.gz)
3. **Prepare release notes** with version changes
4. **Distribute to customers** via preferred method
5. **Provide support** during installation

---

**Last Updated:** 2025-01-14
