# ⚠️ IMPORTANT: How to Start the LIMS Application

## 🚀 Quick Start (ALWAYS use this method)

### **Double-click this file:**
```
START_HERE.bat
```

This will:
1. ✅ Stop any old servers
2. ✅ Start PDF Server (port 3001)
3. ✅ Start Frontend (port 5173)
4. ✅ Open both in separate windows

---

## ⚠️ DO NOT USE `npm run dev` ALONE!

The LIMS application requires **TWO servers**:

### 1. **PDF Server** (Port 3001)
- Generates PDF documents
- Handles Thai fonts
- Uses Puppeteer for rendering

### 2. **Frontend** (Port 5173)
- React application
- User interface
- Connects to PDF server

---

## 🐛 If PDFs Don't Generate

### Symptoms:
- Error: "Failed to fetch"
- Error: "Failed to generate PDF"
- PDF preview doesn't show

### Solution:
1. **Close all server windows**
2. **Double-click `START_HERE.bat`** again
3. **Wait for both servers to start**
4. **Refresh your browser**

---

## 🔍 Verify Servers are Running

### Check PDF Server:
Open: http://localhost:3001/health

Should show: `{"status":"OK","message":"PDF Server is running"}`

### Check Frontend:
Open: http://localhost:5173

Should show the LIMS login page.

---

## 🛑 How to Stop Servers

### Method 1: Close Windows
- Close both server windows (X button)

### Method 2: Use Ctrl+C
- Press `Ctrl+C` in each server window
- Confirm with `Y` if asked

---

## 📝 Manual Start (If Batch File Fails)

### Terminal 1 - PDF Server:
```bash
cd server
node index.js
```

### Terminal 2 - Frontend:
```bash
npm run dev
```

Keep both terminals open!

---

## 🔧 Troubleshooting

### "Port 3001 already in use"
1. Close all server windows
2. Wait 5 seconds
3. Run `START_HERE.bat` again

### "Port 5173 already in use"
1. Close all browser tabs
2. Close all server windows
3. Run `START_HERE.bat` again

### Still Not Working?
1. Check Windows Firewall
2. Check Antivirus (may block Puppeteer)
3. Run as Administrator

---

## ✅ Success Checklist

When both servers are running, you should see:

- [ ] PDF Server window open and showing "PDF Server running on port 3001"
- [ ] Frontend window open and showing "Local: http://localhost:5173"
- [ ] Can open http://localhost:3001/health and see OK
- [ ] Can open http://localhost:5173 and see login page
- [ ] PDF generation works without errors

---

## 📌 Remember:

### ✅ DO:
- Use `START_HERE.bat` to start the application
- Keep both server windows open while working
- Close both windows when done

### ❌ DON'T:
- Use `npm run dev` alone
- Close only one server window
- Forget to start the PDF server

---

## 🎯 Summary

**Always start with `START_HERE.bat`** - it handles everything automatically!

---

Last Updated: 2025-10-13

