# Firebase Configuration Setup Tool

A simple GUI tool to configure Firebase credentials for the LIMS application.

## Features

- User-friendly GUI interface
- Input validation for Firebase credentials
- Connection testing (format validation)
- Automatic .env file generation
- Load existing configuration
- **Standalone executable available** (no Python required!)

## Two Ways to Use

### Option 1: Standalone Executable (Recommended - No Python Required!)

The tool can be packaged as a standalone executable that runs on any PC without Python installed.

**For Windows:**
1. Run `build-executable.bat` (double-click it)
2. Wait for the build to complete (~1-2 minutes)
3. Find `FirebaseSetupTool.exe` in the `dist` folder
4. Distribute this `.exe` file to any Windows PC - it will run without Python!

**For Linux/Mac:**
1. Run `chmod +x build-executable.sh`
2. Run `./build-executable.sh`
3. Find the executable in the `dist` folder
4. Distribute it to any Linux/Mac system

**Note:** You only need to build the executable once. After that, you can distribute the `.exe` file to any PC without Python installed.

### Option 2: Run with Python (Development)

If you have Python installed and want to run the source code directly:

**Windows:**
```bash
python main.py
```

**Linux/Mac:**
```bash
python3 main.py
```

**Requirements for running with Python:**
- Python 3.6 or higher
- tkinter (usually included with Python)

## How to Use

1. **Get Firebase Credentials**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project
   - Go to Project Settings (gear icon)
   - Scroll to "Your apps" section
   - Click on Web app icon (</>) or create a new web app
   - Copy the configuration values

2. **Enter Credentials**
   - Run the tool: `python main.py`
   - Fill in all required fields (marked with *)
   - Click "Test Connection" to validate format
   - Click "Generate .env File" to create the configuration file

3. **Next Steps**
   - The tool will create a `.env` file in the `lims-app` directory
   - Follow the installation guide to deploy your application

## Configuration Fields

- **API Key**: Your Firebase API key (starts with "AIza")
- **Auth Domain**: Your project's auth domain (e.g., `project-id.firebaseapp.com`)
- **Project ID**: Your Firebase project ID
- **Storage Bucket**: Your storage bucket (e.g., `project-id.appspot.com`)
- **Messaging Sender ID**: Your messaging sender ID (numeric)
- **App ID**: Your app ID (starts with "1:")
- **Measurement ID**: Optional, for Google Analytics

## Building Standalone Executable

### Prerequisites for Building

You only need Python to **build** the executable. Once built, the executable can run on any PC without Python.

1. **Install PyInstaller** (one-time setup):
   ```bash
   pip install pyinstaller
   ```

2. **Build the executable**:
   - **Windows**: Double-click `build-executable.bat`
   - **Linux/Mac**: Run `./build-executable.sh`

3. **Find your executable**:
   - Windows: `dist/FirebaseSetupTool.exe`
   - Linux: `dist/FirebaseSetupTool`
   - Mac: `dist/FirebaseSetupTool`

### Distributing the Executable

- **Windows**: Just copy `FirebaseSetupTool.exe` to any Windows PC and double-click to run
- **Linux**: Copy the executable and make it executable: `chmod +x FirebaseSetupTool`
- **Mac**: Copy the executable and run it

**No Python installation required on the target PC!**

## Troubleshooting

### Running the Executable
- **Windows Defender warning**: This is normal for unsigned executables. Click "More info" → "Run anyway"
- **File blocked**: Right-click → Properties → Unblock → Apply
- **Permission denied (Linux/Mac)**: Run `chmod +x FirebaseSetupTool`

### Running with Python
- **tkinter not found**: Install tkinter package for your Python distribution
- **Permission denied**: Ensure you have write permissions in the target directory
- **File not found**: Make sure you're running from the correct directory

### Building the Executable
- **PyInstaller not found**: Run `pip install pyinstaller`
- **Build fails**: Make sure you're using Python 3.6 or higher
- **Large file size**: This is normal - PyInstaller bundles Python and all dependencies (~10-20MB)
