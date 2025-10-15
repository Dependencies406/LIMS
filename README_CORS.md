# 🚨 PDF Logo CORS Error? Here's the Fix!

## The Error You're Seeing:
```
Failed to convert image to base64: TypeError: Failed to fetch
Failed to load company logo for PDF
```

## The Solution (5 minutes):

### 📦 Step 1: Install Google Cloud SDK
- **Windows:** https://cloud.google.com/sdk/docs/install
- **Mac:** `brew install google-cloud-sdk`
- **Linux:** `curl https://sdk.cloud.google.com | bash`

### 🔐 Step 2: Login
```bash
gcloud auth login
```

### 🎯 Step 3: Set Project
```bash
gcloud config set project YOUR_PROJECT_ID
```
*Get YOUR_PROJECT_ID from `.env` file or Firebase Console*

### ⚙️ Step 4: Apply CORS
```bash
gsutil cors set cors.json gs://YOUR_PROJECT_ID.appspot.com
```

### ✅ Step 5: Verify
```bash
gsutil cors get gs://YOUR_PROJECT_ID.appspot.com
```

### 🧹 Step 6: Clear Cache & Test
- Clear browser cache (Ctrl+Shift+Delete)
- Refresh app
- Generate PDF
- ✅ Logo appears!

---

## 📚 Need More Help?

| Document | Purpose |
|----------|---------|
| **CORS_FIX_SUMMARY.md** | Quick overview of the issue |
| **SETUP_FIREBASE_STORAGE_CORS.md** | Detailed 5-minute guide |
| **CORS_SETUP_CHECKLIST.md** | Step-by-step with checkboxes |
| **docs/FIREBASE_STORAGE_CORS_SETUP.md** | Comprehensive troubleshooting |

---

## ❓ Why Is This Needed?

- PDF generation uses `html2canvas` to convert HTML to images
- Browser security requires CORS headers to load cross-origin images
- Firebase Storage doesn't enable CORS by default
- This is a **one-time setup** - you'll never need to do it again!

---

## 🎯 Quick Checklist

- [ ] Install Google Cloud SDK
- [ ] Run `gcloud auth login`
- [ ] Run `gcloud config set project YOUR_PROJECT_ID`
- [ ] Run `gsutil cors set cors.json gs://YOUR_PROJECT_ID.appspot.com`
- [ ] Run `gsutil cors get gs://...` to verify
- [ ] Clear browser cache
- [ ] Test PDF generation
- [ ] ✅ Logo appears!

---

## 💡 Pro Tips

- Make sure you're logged in with the correct Google account
- The project ID is in your `.env` file as `VITE_FIREBASE_PROJECT_ID`
- Wait 2-3 minutes after applying CORS for changes to propagate
- Clear browser cache completely - this is important!

---

## 🆘 Troubleshooting

| Issue | Solution |
|-------|----------|
| "gsutil: command not found" | Restart terminal after SDK installation |
| "Permission denied" | Make sure you're an Owner/Editor on the Firebase project |
| "Bucket not found" | Check bucket name in Firebase Console → Storage |
| Still not working | Wait 2-3 minutes, clear cache, try incognito window |

---

## 🎉 After Setup

✅ Logos appear in PDFs  
✅ No more errors  
✅ Works forever (unless you change Firebase project)  
✅ Works for all users  

---

**Ready to fix it?** Just run those 4 commands above! 🚀

Or open **SETUP_FIREBASE_STORAGE_CORS.md** for the full guide.

