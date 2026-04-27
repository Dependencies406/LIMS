# Quick Start: Creating Distribution Package

This is a quick reference guide for creating a distribution package of the LIMS application.

## Prerequisites

- Node.js and npm installed
- Application built (`npm run build`)
- All dependencies installed

## Steps

### 1. Build the Application

```bash
npm run build
```

This creates the `dist/` directory with the built application.

### 2. Create Distribution Package

```bash
npm run package
```

This will:
- Create `dist-package/` directory
- Copy all necessary files
- Include setup tools and documentation
- Create installation scripts

### 3. Verify Package Contents

Check that `dist-package/` contains:
- ✅ `lims-app/` directory with application files
- ✅ `firebase-setup-tool/` directory with Python tool
- ✅ `SETUP_GUIDE.md` and `INSTALLATION_GUIDE.md`
- ✅ `install.bat` and `install.sh` scripts
- ✅ `README.md`

### 4. Create Distribution Archive

**Windows (PowerShell):**
```powershell
Compress-Archive -Path dist-package -DestinationPath lims-distribution-v1.0.zip
```

**Linux/Mac:**
```bash
zip -r lims-distribution-v1.0.zip dist-package/
# or
tar -czf lims-distribution-v1.0.tar.gz dist-package/
```

### 5. Test the Package (Optional but Recommended)

1. Extract to a new location
2. Follow the installation guide
3. Verify everything works

## Distribution Checklist

Before distributing:

- [ ] Application builds successfully
- [ ] Package created without errors
- [ ] All files included in package
- [ ] Documentation is complete
- [ ] Setup tool works correctly
- [ ] Installation scripts work
- [ ] Package tested on clean environment
- [ ] Version number updated
- [ ] Archive created and verified

## Common Issues

**Issue: "dist directory not found"**
- Solution: Run `npm run build` first

**Issue: "Missing files in package"**
- Solution: Check file paths in `package-distribution.ts`

**Issue: "Package too large"**
- Solution: Ensure `node_modules/` is not included (customers will install)

## Next Steps

After creating the package:

1. Test installation on clean environment
2. Create distribution archive
3. Prepare release notes
4. Distribute to customers

For detailed information, see `DISTRIBUTION_README.md`.
