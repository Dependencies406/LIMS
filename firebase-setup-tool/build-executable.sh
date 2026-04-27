#!/bin/bash
# Linux/Mac shell script to build standalone executable
# This script builds the Firebase Setup Tool as a standalone executable

echo "============================================================"
echo "Firebase Setup Tool - Executable Builder (Linux/Mac)"
echo "============================================================"
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed!"
    echo "Please install Python 3.6 or higher"
    exit 1
fi

echo "Python found!"
echo ""

# Run the build script
python3 build-executable.py

echo ""
echo "============================================================"
echo "Build process completed!"
echo "============================================================"
echo ""
echo "The executable will be in the 'dist' folder."
echo "You can distribute it to any Linux/Mac system."
echo ""
