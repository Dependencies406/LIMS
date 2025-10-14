# PDF Generation Server

This server handles server-side PDF generation with full Thai character support using Puppeteer and Google Fonts.

## Features

- **Thai Font Support**: Uses Noto Sans Thai from Google Fonts for proper Thai character rendering
- **Clean PDF Generation**: Generates professional-looking PDFs with proper formatting
- **Customizable**: Supports all PDF settings from the frontend (margins, fonts, visibility)

## Prerequisites

- Node.js (v14 or higher)
- npm

## Installation

```bash
cd server
npm install
```

## Running the Server

```bash
npm start
```

The server will start on port 3001 by default.

## Health Check

You can check if the server is running by visiting:
```
http://localhost:3001/health
```

## API Endpoints

### POST /api/generate-pdf

Generates a PDF for a job.

**Request Body:**
```json
{
  "jobData": {
    "jobId": "CPN-CAL-25001",
    "title": "Job Title",
    "customerCode": "CUST001",
    ...
  },
  "settings": {
    "pageSize": "A4",
    "margin": { "top": 20, "right": 20, "bottom": 20, "left": 20 },
    "fontSize": { "title": 18, "heading": 14, "body": 12, "small": 10 },
    "jobTableColumns": { ... },
    "equipmentTableColumns": { ... }
  }
}
```

**Response:**
- Content-Type: `application/pdf`
- Returns the generated PDF as binary data

## Technology Stack

- **Express**: Web framework
- **Puppeteer**: Headless Chrome for PDF generation
- **CORS**: Cross-origin resource sharing support
- **Google Fonts**: Noto Sans Thai for Thai character support

## Notes

- The first PDF generation may take a few seconds as Puppeteer launches Chrome
- Subsequent generations are faster
- Thai characters are fully supported and render correctly

