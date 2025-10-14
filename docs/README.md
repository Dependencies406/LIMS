# 🧪 LIMS - Laboratory Information Management System

A modern, professional Laboratory Information Management System built with React 19, TypeScript, and Firebase.

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Install frontend dependencies
npm install

# Install server dependencies
cd server
npm install
cd ..
```

### 2. Start Both Servers

You need to run both the PDF server and the frontend dev server:

**Terminal 1 - PDF Server:**
```bash
cd server
npm start
```

**Terminal 2 - Frontend:**
```bash
npm run dev
```

The app will be available at `http://localhost:5173` and the PDF server at `http://localhost:3001`.

## 📚 Documentation

All documentation is organized in the `docs/` folder:

- **`docs/GET_STARTED_NOW.md`** - Quick start guide (START HERE!)
- **`docs/SETUP_ENV.md`** - Environment configuration guide
- **`docs/QUICK_REFERENCE.md`** - Developer quick reference
- **`docs/REFACTORING_GUIDE.md`** - Architecture guide

See `docs/README.md` for complete documentation index.

## ✨ Features

- **📊 Multiple View Modes** - List, Card, and Grid views
- **📄 PDF Generation** - Professional PDF reports with customization
- **📤 Export System** - CSV, JSON, and summary reports
- **📁 File Upload** - Ready-to-integrate file management
- **🔄 Real-time Sync** - Firebase Firestore integration
- **🔐 Authentication** - Role-based access control
- **⚙️ Global PDF Settings** - Admin-controlled PDF configuration
- **🎨 Modern UI** - Clean, responsive interface with Tailwind CSS

## 🛠️ Tech Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Backend**: Firebase (Firestore, Auth, Storage)
- **PDF Generation**: Puppeteer (server-side) with Thai font support
- **PDF Server**: Node.js + Express
- **State Management**: React Context + Custom Hooks

## 🏗️ Project Structure

```
src/
├── components/          # React components
│   ├── common/         # Reusable UI components
│   ├── jobs/           # Job-related components
│   └── customers/      # Customer-related components
├── contexts/           # React contexts
├── hooks/              # Custom hooks
├── services/           # Business logic services
├── types/              # TypeScript type definitions
└── utils/              # Utility functions
```

## 🔧 Configuration

Before running the app, create a `.env` file with your Firebase credentials.
See `docs/SETUP_ENV.md` for detailed instructions.

## 🎯 Key Features

### **PDF Generation**
- Professional PDF reports with customizable templates
- Smart table rendering with proper text wrapping
- Global settings controlled by administrators
- Preview before download

### **Export System**
- Export jobs and customers to CSV
- Generate summary reports with statistics
- JSON export for data backup
- Filtered exports based on search criteria

### **View Modes**
- **List View**: Detailed table format
- **Card View**: Balanced card layout (default)
- **Grid View**: Compact grid for quick browsing

### **Authentication & Roles**
- Firebase Authentication
- Role-based access control (Admin/Staff)
- Admin-only features (PDF settings, etc.)

## 📖 Getting Started

1. **Setup Environment**: See `docs/SETUP_ENV.md`
2. **Install Dependencies**: `npm install`
3. **Start Development**: `npm run dev`
4. **Quick Start Guide**: See `docs/GET_STARTED_NOW.md`

## 🎨 UI Components

The app uses custom Tailwind CSS components for consistency:
- **Button**: Primary, secondary, and variant styles
- **Input**: Form inputs with validation
- **Modal**: Reusable modal dialogs
- **Card**: Content containers
- **ViewToggle**: Switch between view modes

## 📊 Data Models

### Job
- Job ID, title, status
- Customer information
- Assigned staff
- Start/end/due dates
- Equipment list
- Comments and attachments

### Customer
- Customer code, name
- Contact information
- Address details
- Associated jobs

### Equipment
- Name, manufacturer, model
- Serial number
- Calibration details
- Location and accessories

## 🔮 Upcoming Features

- Digital signature capture
- Email PDF reports
- Batch operations
- Advanced analytics dashboard
- Template management

## 🐛 Bug Reports

If you encounter any issues, please check the documentation in the `docs/` folder first.

## 📄 License

This project is for internal use.

---

**Built with ❤️ using React 19, TypeScript, and Firebase**
