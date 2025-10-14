# 🧪 LIMS - Laboratory Information Management System

A modern, full-featured Laboratory Information Management System built with React, TypeScript, and Firebase.

## 🚀 Quick Start

### Start the Application

Use the automated startup script (recommended):

```bash
START_HERE.bat
```

This will automatically start both:
- Frontend (Vite dev server on port 5173)
- PDF Server (Node.js on port 3001)

### Manual Start

If you prefer to start manually:

**Terminal 1 - Frontend:**
```bash
npm run dev
```

**Terminal 2 - PDF Server:**
```bash
cd server
node index.js
```

## 📚 Documentation

All documentation is available in the **`docs/`** folder:

- **[Optimize_10-14-2025.html](docs/Optimize_10-14-2025.html)** - Latest optimization report (beautiful HTML format)
- **[HOW_TO_START_LIMS_DEV.html](docs/HOW_TO_START_LIMS_DEV.html)** - Development startup guide
- **Additional guides** - 40+ markdown files with detailed documentation

## ✨ Features

- 📋 **Job Management** - Create, edit, track calibration jobs
- 👥 **Customer Management** - Maintain customer database
- 👤 **User Management** - Admin can create/manage user accounts
- 📄 **PDF Generation** - Customizable job reports with headers/footers
- ⚙️ **Settings** - Configure job IDs, company info, PDF templates
- 🔐 **Role-Based Access** - Admin and Staff user roles
- 📊 **View Modes** - List, Card, and Grid views for jobs/customers

## 🛠️ Tech Stack

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS
- **Backend:** Firebase (Authentication, Firestore, Storage)
- **PDF Generation:** Node.js + Puppeteer + Express
- **State Management:** React Context API + Custom Hooks

## 📖 Quick Links

- **Main Documentation:** [docs/README.md](docs/README.md)
- **Setup Guide:** [docs/GET_STARTED_NOW.md](docs/GET_STARTED_NOW.md)
- **User Management:** [docs/USER_MANAGEMENT_GUIDE.md](docs/USER_MANAGEMENT_GUIDE.md)
- **PDF Configuration:** [docs/HEADER_FOOTER_SUMMARY.md](docs/HEADER_FOOTER_SUMMARY.md)

## 🔧 Environment Setup

1. Copy `.env.example` to `.env`
2. Fill in your Firebase credentials
3. Run `npm install`
4. Run `cd server && npm install`
5. Start with `START_HERE.bat`

## 📝 License

Internal use only - Laboratory Information Management System

---

**Last Updated:** October 14, 2025  
**Version:** 3.0 (Optimized)

