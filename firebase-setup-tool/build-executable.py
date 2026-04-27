#!/usr/bin/env python3
"""
Build script to create standalone executable for Firebase Setup Tool
Uses PyInstaller to package the application with all dependencies
"""

import os
import sys
import subprocess
from pathlib import Path

def check_pyinstaller():
    """Check if PyInstaller is installed"""
    try:
        import PyInstaller
        return True
    except ImportError:
        return False

def install_pyinstaller():
    """Install PyInstaller"""
    print("Installing PyInstaller...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])
    print("✓ PyInstaller installed successfully")

def find_pyinstaller():
    """Find PyInstaller executable"""
    # Try different ways to call PyInstaller
    import shutil
    
    # Method 1: Try as module (most reliable)
    try:
        result = subprocess.run(
            [sys.executable, "-m", "PyInstaller", "--version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            return [sys.executable, "-m", "PyInstaller"]
    except:
        pass
    
    # Method 2: Try direct command
    pyinstaller_path = shutil.which("pyinstaller")
    if pyinstaller_path:
        return [pyinstaller_path]
    
    # Method 3: Try pyinstaller.exe
    pyinstaller_exe = shutil.which("pyinstaller.exe")
    if pyinstaller_exe:
        return [pyinstaller_exe]
    
    return None

def build_executable():
    """Build the executable"""
    script_dir = Path(__file__).parent
    main_script = script_dir / "main.py"
    
    if not main_script.exists():
        print(f"Error: {main_script} not found!")
        return False
    
    # Find PyInstaller
    pyinstaller_cmd = find_pyinstaller()
    if not pyinstaller_cmd:
        print("Error: Could not find PyInstaller executable!")
        print("Please ensure PyInstaller is installed: pip install pyinstaller")
        return False
    
    print("Building standalone executable...")
    print("This may take a few minutes...")
    print(f"Using: {' '.join(pyinstaller_cmd)}")
    
    # PyInstaller command arguments
    cmd = pyinstaller_cmd + [
        "--onefile",  # Single executable file
        "--windowed",  # No console window (GUI app)
        "--name=FirebaseSetupTool",  # Executable name
        "--clean",  # Clean cache before building
        str(main_script)
    ]
    
    # Add data files if needed (none for this simple app)
    # cmd.extend(["--add-data", "path/to/data;."])
    
    try:
        subprocess.check_call(cmd, cwd=script_dir)
        print("\n✓ Build successful!")
        
        # Check for executable (Windows uses .exe, Linux/Mac don't)
        exe_name = "FirebaseSetupTool.exe" if sys.platform == "win32" else "FirebaseSetupTool"
        exe_path = script_dir / "dist" / exe_name
        
        if exe_path.exists():
            print(f"\nExecutable location: {exe_path}")
            print(f"File size: {exe_path.stat().st_size / (1024*1024):.1f} MB")
        else:
            print(f"\nExecutable should be in: {script_dir / 'dist'}")
            print("Please check the dist folder for the executable.")
        
        print("\nYou can now distribute this executable to any PC without Python!")
        return True
    except subprocess.CalledProcessError as e:
        print(f"\n✗ Build failed with return code: {e.returncode}")
        print("Check the error messages above for details.")
        return False
    except FileNotFoundError as e:
        print(f"\n✗ Build failed: Could not find PyInstaller")
        print(f"Error: {e}")
        print("\nTry installing PyInstaller: pip install pyinstaller")
        return False
    except Exception as e:
        print(f"\n✗ Build failed: {e}")
        print(f"Error type: {type(e).__name__}")
        return False

def main():
    print("=" * 60)
    print("Firebase Setup Tool - Executable Builder")
    print("=" * 60)
    print()
    
    # Check Python version
    if sys.version_info < (3, 6):
        print("Error: Python 3.6 or higher is required!")
        sys.exit(1)
    
    print(f"Python version: {sys.version}")
    print()
    
    # Check/install PyInstaller
    if not check_pyinstaller():
        print("PyInstaller not found. Installing...")
        try:
            install_pyinstaller()
        except Exception as e:
            print(f"Failed to install PyInstaller: {e}")
            print("\nPlease install manually: pip install pyinstaller")
            sys.exit(1)
    else:
        print("✓ PyInstaller is installed")
    
    print()
    
    # Build executable
    if build_executable():
        print("\n" + "=" * 60)
        print("Build completed successfully!")
        print("=" * 60)
    else:
        print("\n" + "=" * 60)
        print("Build failed. Please check the errors above.")
        print("=" * 60)
        sys.exit(1)

if __name__ == "__main__":
    main()
