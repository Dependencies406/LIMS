# Firebase Storage CORS Configuration

## Problem
When generating PDFs with company logos, you may encounter CORS errors:
```
Failed to convert image to base64: TypeError: Failed to fetch
Failed to load company logo for PDF
```

This happens because Firebase Storage needs to be configured to allow cross-origin requests.

## Solution: Configure Firebase Storage CORS

### Step 1: Install Google Cloud SDK

If you haven't already, install the Google Cloud SDK:
- Windows: Download from https://cloud.google.com/sdk/docs/install
- Mac: `brew install google-cloud-sdk`
- Linux: Follow instructions at https://cloud.google.com/sdk/docs/install

### Step 2: Authenticate with Google Cloud

```bash
gcloud auth login
```

### Step 3: Set Your Project

Replace `YOUR_PROJECT_ID` with your Firebase project ID (visible in Firebase Console):

```bash
gcloud config set project YOUR_PROJECT_ID
```

### Step 4: Apply CORS Configuration

In your project root, there's a `cors.json` file. Apply it to your Firebase Storage bucket:

```bash
gcloud storage buckets update gs://YOUR_PROJECT_ID.appspot.com --cors-file=cors.json
```

Or use the newer gsutil command:

```bash
gsutil cors set cors.json gs://YOUR_PROJECT_ID.appspot.com
```

### Step 5: Verify CORS Configuration

Check if CORS is properly configured:

```bash
gcloud storage buckets describe gs://YOUR_PROJECT_ID.appspot.com --format="default(cors)"
```

Or with gsutil:

```bash
gsutil cors get gs://YOUR_PROJECT_ID.appspot.com
```

## Alternative: Using Firebase Console

Unfortunately, Firebase Console doesn't provide a UI for CORS configuration. You **must** use the Google Cloud SDK commands above.

## CORS Configuration Explained

The `cors.json` file configures:

```json
[
  {
    "origin": ["*"],               // Allow all origins (adjust for production)
    "method": ["GET", "HEAD"],     // Allow GET and HEAD requests
    "maxAgeSeconds": 3600,         // Cache CORS preflight for 1 hour
    "responseHeader": [            // Headers to expose
      "Content-Type", 
      "Access-Control-Allow-Origin"
    ]
  }
]
```

### Production Security

For production, restrict origins to your domain:

```json
{
  "origin": ["https://yourdomain.com", "https://www.yourdomain.com"],
  "method": ["GET", "HEAD"],
  "maxAgeSeconds": 3600,
  "responseHeader": ["Content-Type", "Access-Control-Allow-Origin"]
}
```

## Testing

After applying CORS configuration:

1. **Clear your browser cache** (important!)
2. Go to Settings > Company Info
3. Upload a company logo
4. Configure PDF header to use `{company_logo}`
5. Generate a PDF - the logo should now appear without errors

## Troubleshooting

### Still getting CORS errors?

1. **Clear browser cache completely**
   - Chrome: Ctrl+Shift+Delete > Clear cached images and files
   - Firefox: Ctrl+Shift+Delete > Cache

2. **Verify the bucket name**
   - In Firebase Console, go to Storage
   - The bucket name is shown at the top (usually `YOUR_PROJECT_ID.appspot.com`)

3. **Check authentication**
   - Make sure you're logged into the correct Google account
   - Run `gcloud auth list` to see active accounts

4. **Wait a few minutes**
   - CORS changes can take 1-5 minutes to propagate

### Command not found?

If `gcloud` command is not found:
- Windows: Restart your terminal/command prompt after installation
- Mac/Linux: Add to PATH: `export PATH=$PATH:$HOME/google-cloud-sdk/bin`

### Permission denied?

Make sure your Google account has Owner or Editor role on the Firebase project.

## Quick Reference Commands

```bash
# Login
gcloud auth login

# Set project
gcloud config set project YOUR_PROJECT_ID

# Apply CORS
gsutil cors set cors.json gs://YOUR_PROJECT_ID.appspot.com

# Verify CORS
gsutil cors get gs://YOUR_PROJECT_ID.appspot.com
```

## Why is this necessary?

- PDF generation uses `html2canvas` to convert HTML to images
- `html2canvas` needs to load images into a canvas element
- Browsers require CORS headers to load cross-origin images into canvas
- Firebase Storage doesn't enable CORS by default for security

## After Configuration

Once CORS is properly configured:
- ✅ Company logos will appear in PDFs
- ✅ No more "Failed to fetch" errors
- ✅ PDF generation will work smoothly
- ✅ Images load instantly from Firebase Storage

## Need Help?

If you're still having issues:
1. Check the browser console for specific error messages
2. Verify your Firebase Storage security rules allow read access
3. Make sure the logo URL is from Firebase Storage (not external)
4. Try accessing the image URL directly in a browser tab


