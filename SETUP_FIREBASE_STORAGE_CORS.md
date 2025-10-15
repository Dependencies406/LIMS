# 🚀 Quick Setup: Firebase Storage CORS

## ⚠️ You're seeing this because PDF logo loading failed

Your Firebase Storage needs CORS (Cross-Origin Resource Sharing) configured to allow the app to load images for PDF generation.

## 📋 5-Minute Setup

### Step 1: Install Google Cloud SDK (if not installed)

**Windows:**
```powershell
# Download and run installer from:
https://cloud.google.com/sdk/docs/install

# After installation, restart PowerShell/Terminal
```

**Mac:**
```bash
brew install google-cloud-sdk
```

**Linux:**
```bash
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
```

### Step 2: Authenticate

```bash
gcloud auth login
```
This will open a browser window - sign in with your Google account that has access to the Firebase project.

### Step 3: Set Your Project

Find your project ID in Firebase Console (in the URL or Project Settings), then:

```bash
gcloud config set project YOUR_PROJECT_ID
```

**For this project:** Check your `.env` file for `VITE_FIREBASE_PROJECT_ID`

### Step 4: Apply CORS Configuration

The `cors.json` file is already in your project root. Just run:

```bash
gsutil cors set cors.json gs://YOUR_PROJECT_ID.appspot.com
```

Replace `YOUR_PROJECT_ID` with your actual project ID.

### Step 5: Verify

```bash
gsutil cors get gs://YOUR_PROJECT_ID.appspot.com
```

You should see the CORS configuration displayed.

### Step 6: Test

1. **Clear your browser cache** (Ctrl+Shift+Delete)
2. Refresh the app
3. Try generating a PDF with a logo
4. ✅ Logo should now appear!

## 🆘 Troubleshooting

### "gsutil: command not found"

The Google Cloud SDK wasn't installed correctly or not in PATH.

**Fix:**
- Windows: Restart your terminal after installation
- Mac/Linux: Run `source ~/.bashrc` or restart terminal

### "AccessDeniedException: 403"

Your Google account doesn't have permission on this Firebase project.

**Fix:**
- Make sure you're logged in with the correct account: `gcloud auth list`
- Ask the project owner to add you as Editor/Owner in Firebase Console

### "BucketNotFoundException"

Wrong bucket name.

**Fix:**
- Check Firebase Console > Storage for the exact bucket name
- It's usually `PROJECT_ID.appspot.com` or `PROJECT_ID.firebasestorage.app`

### Still not working?

1. Wait 2-3 minutes for CORS changes to propagate
2. Clear browser cache completely
3. Check browser console for specific error messages
4. Verify the logo is uploaded to Firebase Storage (not external URL)

## 💡 What's in cors.json?

```json
[
  {
    "origin": ["*"],
    "method": ["GET", "HEAD"],
    "maxAgeSeconds": 3600,
    "responseHeader": ["Content-Type", "Access-Control-Allow-Origin"]
  }
]
```

This allows:
- ✅ All origins to request images (for development)
- ✅ GET and HEAD methods
- ✅ Responses cached for 1 hour

**For production:** Edit `cors.json` to restrict origins to your domain.

## 📚 More Details

See `docs/FIREBASE_STORAGE_CORS_SETUP.md` for comprehensive documentation.

## ✨ After Setup

Once CORS is configured:
- Company logos will appear in PDFs
- No more "Failed to fetch" errors  
- PDF generation works smoothly
- Images load instantly

---

**Need help?** Check the detailed guide: `docs/FIREBASE_STORAGE_CORS_SETUP.md`


