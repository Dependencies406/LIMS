# Server-Side PDF Generation with Thai Font Support

## Overview

The LIMS application now uses **server-side PDF generation** to provide full Thai character support. This solves the previous limitation where `pdf-lib` (client-side) couldn't render Thai characters properly.

## Architecture

### Components

1. **PDF Server** (`/server`)
   - Node.js + Express server
   - Puppeteer for PDF generation
   - Runs on port 3001

2. **Frontend** (`/src`)
   - React application
   - Calls PDF server API
   - Runs on port 5173

### How It Works

```
┌─────────────┐      HTTP POST       ┌─────────────┐
│   Frontend  │  ──────────────────► │ PDF Server  │
│  (React)    │                      │ (Node.js)   │
└─────────────┘                      └─────────────┘
                                            │
                                            ▼
                                     ┌──────────────┐
                                     │  Puppeteer   │
                                     │ (Chromium)   │
                                     └──────────────┘
                                            │
                                            ▼
                                     ┌──────────────┐
                                     │ HTML → PDF   │
                                     │ (Thai fonts) │
                                     └──────────────┘
                                            │
                                            ▼
                                     ┌──────────────┐
                                     │  PDF Binary  │
                                     └──────────────┘
                                            │
                                            ▼
┌─────────────┐  ◄────────────────  ┌─────────────┐
│   Frontend  │    PDF Response     │ PDF Server  │
└─────────────┘                      └─────────────┘
```

## Setup

### 1. Install Dependencies

```bash
# Frontend dependencies
npm install

# Server dependencies
cd server
npm install
cd ..
```

### 2. Start Servers

You need **TWO terminal windows**:

**Terminal 1 - PDF Server:**
```bash
cd server
npm start
```
Output: `PDF Server running on port 3001`

**Terminal 2 - Frontend:**
```bash
npm run dev
```
Output: `Local: http://localhost:5173/`

## Thai Font Support

### How Thai Characters Are Rendered

1. **Google Fonts**: The server uses Noto Sans Thai from Google Fonts
   ```css
   @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600;700&display=swap');
   ```

2. **HTML Template**: Job data is rendered as HTML with Thai font
   ```html
   <body style="font-family: 'Noto Sans Thai', Arial, sans-serif;">
     <div>งานทดสอบ</div> <!-- Thai text -->
   </body>
   ```

3. **Puppeteer**: Converts HTML to PDF with proper font rendering
   - Loads Google Fonts
   - Renders Thai characters correctly
   - Generates professional PDF

### Before vs After

**Before (Client-Side):**
- ❌ Thai characters showed as `?`
- ❌ `WinAnsi cannot encode` errors
- ❌ Limited to standard PDF fonts

**After (Server-Side):**
- ✅ Thai characters render perfectly
- ✅ No encoding errors
- ✅ Uses web fonts (Google Fonts)

## API Reference

### POST /api/generate-pdf

Generates a PDF for a job with Thai character support.

**Endpoint:** `http://localhost:3001/api/generate-pdf`

**Request:**
```json
{
  "jobData": {
    "jobId": "CPN-CAL-25001",
    "title": "งานทดสอบเครื่องมือวัด",  // Thai title
    "customerCode": "CUST001",
    "customerContact": "สมชาย ใจดี",  // Thai name
    "status": "Pending",
    "equipment": [
      {
        "no": 1,
        "name": "เครื่องวัดอุณหภูมิ",  // Thai equipment name
        "manufacturer": "Fluke",
        "model": "52-II",
        "serialNumber": "12345"
      }
    ],
    "comments": "หมายเหตุการทำงาน"  // Thai comments
  },
  "settings": {
    "pageSize": "A4",
    "showHeader": true,
    "showFooter": true,
    "templateName": "Job Request",
    "margin": {
      "top": 20,
      "right": 20,
      "bottom": 20,
      "left": 20
    },
    "fontSize": {
      "title": 18,
      "heading": 14,
      "body": 12,
      "small": 10
    },
    "jobTableColumns": {
      "jobId": true,
      "title": true,
      "customer": true,
      "status": true
    },
    "equipmentTableColumns": {
      "no": true,
      "name": true,
      "manufacturer": true,
      "model": true
    }
  }
}
```

**Response:**
- **Content-Type:** `application/pdf`
- **Content-Disposition:** `attachment; filename="CPN-CAL-25001.pdf"`
- **Body:** PDF binary data

### GET /health

Health check endpoint.

**Endpoint:** `http://localhost:3001/health`

**Response:**
```json
{
  "status": "OK",
  "message": "PDF Server is running"
}
```

## Frontend Integration

### pdfService.ts

The `src/services/pdfService.ts` file now makes HTTP requests to the PDF server:

```typescript
export const generateJobPDF = async (
  job: Job,
  settings: Partial<PdfSettings> = {}
): Promise<Uint8Array> => {
  const response = await fetch('http://localhost:3001/api/generate-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobData: job, settings: pdfSettings })
  });

  const pdfBuffer = await response.arrayBuffer();
  return new Uint8Array(pdfBuffer);
};
```

### Usage in Components

No changes needed! Components still call `generateJobPDF()` as before:

```typescript
const handleExportPDF = async (job: Job) => {
  try {
    const pdfBytes = await generateJobPDF(job, pdfSettings);
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${job.jobId}.pdf`;
    a.click();
  } catch (error) {
    console.error('Error generating PDF:', error);
  }
};
```

## Troubleshooting

### Server Not Starting

**Problem:** PDF server doesn't start
```bash
cd server
npm start
# Error: Cannot find module...
```

**Solution:**
```bash
cd server
npm install
npm start
```

### Connection Refused

**Problem:** Frontend can't connect to PDF server
```
Error: Failed to fetch
```

**Solution:**
1. Check if PDF server is running: `http://localhost:3001/health`
2. Restart PDF server: `cd server && npm start`

### Thai Characters Still Not Working

**Problem:** Thai characters not rendering

**Solution:**
1. Ensure PDF server is running (not just frontend)
2. Check server logs for errors
3. Test health endpoint: `http://localhost:3001/health`
4. Verify Google Fonts are loading (check server logs)

### Port Already in Use

**Problem:** Port 3001 already in use

**Solution:**
1. Find process: `netstat -ano | findstr :3001`
2. Kill process or change port in `server/index.js`:
   ```javascript
   const PORT = process.env.PORT || 3002; // Change to 3002
   ```
3. Update `src/services/pdfService.ts`:
   ```typescript
   const PDF_SERVER_URL = 'http://localhost:3002';
   ```

## Performance

### First PDF Generation
- **Time:** 3-5 seconds
- **Reason:** Puppeteer launches Chromium for the first time

### Subsequent PDF Generations
- **Time:** 1-2 seconds
- **Reason:** Browser instance is reused

### Optimization Tips

1. **Keep Server Running**: Don't restart between generations
2. **Font Caching**: Google Fonts are cached by Puppeteer
3. **Connection Pooling**: Reuse HTTP connections from frontend

## Deployment Considerations

### Development
- Run both servers locally
- PDF Server: `http://localhost:3001`
- Frontend: `http://localhost:5173`

### Production

**Option 1: Same Server**
- Deploy both as Node.js app
- Serve frontend static files
- PDF server on `/api/generate-pdf`

**Option 2: Separate Services**
- Frontend: Firebase Hosting / Vercel
- PDF Server: Heroku / Railway / DigitalOcean
- Update `PDF_SERVER_URL` in config

**Option 3: Serverless**
- Frontend: Static hosting
- PDF API: AWS Lambda / Google Cloud Functions
- Note: Cold starts will be slower

## Benefits of Server-Side Approach

1. **✅ Full Thai Character Support**
   - Uses web fonts
   - No encoding limitations
   - Professional appearance

2. **✅ Better PDF Quality**
   - HTML/CSS rendering
   - Complex layouts
   - Images and logos

3. **✅ Reduced Client Load**
   - PDF generation on server
   - Smaller frontend bundle
   - Better performance on mobile

4. **✅ Easier Maintenance**
   - Update PDF templates easily
   - No client-side font issues
   - Consistent across browsers

## Migration Notes

### Changes from Client-Side

1. **Removed:**
   - `pdf-lib` dependency from frontend
   - All PDF generation logic from frontend
   - Font embedding code

2. **Added:**
   - Express server in `/server`
   - Puppeteer for PDF generation
   - HTTP API for PDF generation

3. **Updated:**
   - `src/services/pdfService.ts` - Now calls server API
   - `README.md` - Updated setup instructions
   - Documentation

### Backward Compatibility

The public API remains the same:
```typescript
// Still works the same way
const pdfBytes = await generateJobPDF(job, settings);
```

Components don't need any changes!

## Conclusion

Server-side PDF generation solves the Thai character rendering problem completely. While it adds a backend server requirement, the benefits far outweigh the complexity:

- ✅ Perfect Thai character support
- ✅ Better PDF quality
- ✅ More flexibility
- ✅ Easier to maintain

The application now provides professional PDF reports suitable for Thai customers.

