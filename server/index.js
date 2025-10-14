const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// PDF generation endpoint
app.post('/api/generate-pdf', async (req, res) => {
  let browser;
  
  try {
    const { jobData, settings } = req.body;
    
    // Launch browser with Render-optimized settings
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({ width: 1200, height: 800 });
    
    // Generate HTML content for the PDF
    const htmlContent = generateJobHTML(jobData, settings);
    
    // Set content
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
    // Inject page numbering script
    await page.evaluate(() => {
      const totalPages = Math.ceil(document.body.scrollHeight / window.innerHeight);
      document.querySelectorAll('.page-number').forEach((element, index) => {
        // For simplicity, we'll show page 1 for single-page or use actual page counter
        element.textContent = `Page 1 of ${totalPages}`;
      });
    });
    
    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: settings?.pageSize === 'A4' ? 'A4' : 'Letter',
      margin: {
        top: settings?.margin?.top || 20,
        right: settings?.margin?.right || 20,
        bottom: settings?.margin?.bottom || 20,
        left: settings?.margin?.left || 20
      },
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: '<span></span>'
    });
    
    // Send PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${jobData.jobId || 'job'}.pdf"`);
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// Helper function to replace placeholders in header/footer content
function replacePlaceholders(text, job, companyInfo, isLogo = false) {
  if (!text) return '';
  
  // Special handling for logo placeholder
  if (text === '{company_logo}') {
    if (companyInfo?.logoUrl) {
      return `<img src="${companyInfo.logoUrl}" alt="Company Logo" style="height: 50px; width: auto; max-width: 150px; object-fit: contain; vertical-align: middle;" />`;
    }
    return '';
  }
  
  const currentDate = new Date();
  
  return text
    .replace(/{company_name}/g, companyInfo?.companyName || 'Company Name')
    .replace(/{company_address}/g, formatCompanyAddress(companyInfo))
    .replace(/{company_phone}/g, companyInfo?.contactInfo?.phone || '')
    .replace(/{company_email}/g, companyInfo?.contactInfo?.email || '')
    .replace(/{company_website}/g, companyInfo?.contactInfo?.website || '')
    .replace(/{page_number}/g, '<span class="page-number"></span>')
    .replace(/{date}/g, currentDate.toLocaleDateString())
    .replace(/{job_id}/g, job?.jobId || '');
}

// Helper function to format company address
function formatCompanyAddress(companyInfo) {
  if (!companyInfo || !companyInfo.address) return '';
  const addr = companyInfo.address;
  return `${addr.street || ''}, ${addr.city || ''}, ${addr.state || ''} ${addr.postalCode || ''}, ${addr.country || ''}`.trim();
}

// Generate HTML content for the job
function generateJobHTML(job, settings) {
  const defaultSettings = {
    templateName: 'Job Request',
    showHeader: true,
    showFooter: true,
    showTableBorders: true,
    fontSize: { title: 18, heading: 14, body: 12, small: 10 },
    jobTableColumns: {
      jobId: true,
      title: true,
      customer: true,
      status: true,
      equipment: true,
      dueDate: true,
      created: true,
      assignedStaff: true,
      startDate: true,
      endDate: true
    },
    equipmentTableColumns: {
      no: true,
      name: true,
      manufacturer: true,
      model: true,
      serialNumber: true,
      calibrationPoint: true,
      calibrationMethods: true,
      accessories: true,
      machineLocation: true,
      remark: true
    }
  };
  
  const pdfSettings = { ...defaultSettings, ...settings };
  
  return `
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Job PDF</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600;700&display=swap');
        
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: 'Noto Sans Thai', Arial, sans-serif;
          font-size: ${pdfSettings.fontSize.body}px;
          line-height: 1.4;
          color: #333;
          background: white;
        }
        
        .header {
          text-align: center;
          margin-bottom: 30px;
          border-bottom: 2px solid #ddd;
          padding-bottom: 20px;
        }
        
        .header h1 {
          font-size: ${pdfSettings.fontSize.title}px;
          font-weight: 700;
          color: #2c3e50;
          margin-bottom: 10px;
        }
        
        .section {
          margin-bottom: 25px;
        }
        
        .section h2 {
          font-size: ${pdfSettings.fontSize.heading}px;
          font-weight: 600;
          color: #34495e;
          margin-bottom: 15px;
          border-bottom: 1px solid #bdc3c7;
          padding-bottom: 5px;
        }
        
        .field {
          margin-bottom: 8px;
          display: flex;
        }
        
        .field-label {
          font-weight: 600;
          min-width: 120px;
          color: #2c3e50;
        }
        
        .field-value {
          flex: 1;
          color: #34495e;
        }
        
        .equipment-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }
        
        .equipment-table th,
        .equipment-table td {
          border: 1px solid #bdc3c7;
          padding: 8px;
          text-align: left;
          font-size: ${pdfSettings.fontSize.small}px;
        }
        
        .equipment-table th {
          background-color: #ecf0f1;
          font-weight: 600;
          color: #2c3e50;
        }
        
        .equipment-table td {
          background-color: white;
        }
        
        .notes {
          margin-top: 20px;
          padding: 15px;
          background-color: #f8f9fa;
          border-left: 4px solid #3498db;
        }
        
        .notes h3 {
          font-size: ${pdfSettings.fontSize.heading}px;
          margin-bottom: 10px;
          color: #2c3e50;
        }
        
        .footer {
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
          text-align: center;
          font-size: ${pdfSettings.fontSize.small}px;
          color: #7f8c8d;
        }
        
        .status-badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: ${pdfSettings.fontSize.small}px;
          font-weight: 500;
        }
        
        .status-pending { background-color: #f39c12; color: white; }
        .status-in-progress { background-color: #3498db; color: white; }
        .status-completed { background-color: #27ae60; color: white; }
        .status-cancelled { background-color: #e74c3c; color: white; }
      </style>
    </head>
    <body>
      ${pdfSettings.showHeader ? `
        <div class="header" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 2px solid #2c3e50; gap: 15px;">
          <div style="flex: 1; text-align: left; font-size: ${pdfSettings.fontSize?.small || 10}pt;">
            ${replacePlaceholders(pdfSettings.headerContent?.left || '', job, settings.companyInfo)}
          </div>
          <div style="flex: 1; text-align: center; font-size: ${pdfSettings.fontSize?.heading || 12}pt; font-weight: bold;">
            ${replacePlaceholders(pdfSettings.headerContent?.center || pdfSettings.templateName, job, settings.companyInfo)}
          </div>
          <div style="flex: 1; text-align: right; font-size: ${pdfSettings.fontSize?.small || 10}pt;">
            ${replacePlaceholders(pdfSettings.headerContent?.right || '', job, settings.companyInfo)}
          </div>
        </div>
      ` : ''}
      
      <div class="section">
        <h2>Job Information</h2>
        ${pdfSettings.jobTableColumns.jobId ? `
          <div class="field">
            <span class="field-label">Job ID:</span>
            <span class="field-value">${job.jobId || 'N/A'}</span>
          </div>
        ` : ''}
        
        ${pdfSettings.jobTableColumns.title ? `
          <div class="field">
            <span class="field-label">Title:</span>
            <span class="field-value">${job.title || 'N/A'}</span>
          </div>
        ` : ''}
        
        ${pdfSettings.jobTableColumns.customer ? `
          <div class="field">
            <span class="field-label">Customer Code:</span>
            <span class="field-value">${job.customerCode || 'N/A'}</span>
          </div>
          <div class="field">
            <span class="field-label">Customer Contact:</span>
            <span class="field-value">${job.customerContact || 'N/A'}</span>
          </div>
        ` : ''}
        
        ${pdfSettings.jobTableColumns.status ? `
          <div class="field">
            <span class="field-label">Status:</span>
            <span class="field-value">
              <span class="status-badge status-${(job.status || '').toLowerCase().replace(' ', '-')}">
                ${job.status || 'N/A'}
              </span>
            </span>
          </div>
        ` : ''}
        
        ${pdfSettings.jobTableColumns.assignedStaff ? `
          <div class="field">
            <span class="field-label">Assigned Staff:</span>
            <span class="field-value">${job.assignedStaff || 'Unassigned'}</span>
          </div>
        ` : ''}
        
        ${pdfSettings.jobTableColumns.startDate ? `
          <div class="field">
            <span class="field-label">Start Date:</span>
            <span class="field-value">${job.startDate || 'Not set'}</span>
          </div>
        ` : ''}
        
        ${pdfSettings.jobTableColumns.dueDate ? `
          <div class="field">
            <span class="field-label">Due Date:</span>
            <span class="field-value">${job.dueDate || 'Not set'}</span>
          </div>
        ` : ''}
        
        ${pdfSettings.jobTableColumns.endDate ? `
          <div class="field">
            <span class="field-label">End Date:</span>
            <span class="field-value">${job.endDate || 'Not completed'}</span>
          </div>
        ` : ''}
        
        ${pdfSettings.jobTableColumns.created ? `
          <div class="field">
            <span class="field-label">Created:</span>
            <span class="field-value">${job.createdAt ? new Date(job.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}</span>
          </div>
        ` : ''}
      </div>
      
      ${job.equipment && job.equipment.length > 0 ? `
        <div class="section">
          <h2>Equipment List</h2>
          <table class="equipment-table">
            <thead>
              <tr>
                ${pdfSettings.equipmentTableColumns.no ? '<th>No</th>' : ''}
                ${pdfSettings.equipmentTableColumns.name ? '<th>Name</th>' : ''}
                ${pdfSettings.equipmentTableColumns.manufacturer ? '<th>Manufacturer</th>' : ''}
                ${pdfSettings.equipmentTableColumns.model ? '<th>Model</th>' : ''}
                ${pdfSettings.equipmentTableColumns.serialNumber ? '<th>Serial Number</th>' : ''}
                ${pdfSettings.equipmentTableColumns.calibrationPoint ? '<th>Calibration Point</th>' : ''}
                ${pdfSettings.equipmentTableColumns.calibrationMethods ? '<th>Calibration Methods</th>' : ''}
                ${pdfSettings.equipmentTableColumns.accessories ? '<th>Accessories</th>' : ''}
                ${pdfSettings.equipmentTableColumns.machineLocation ? '<th>Machine Location</th>' : ''}
                ${pdfSettings.equipmentTableColumns.remark ? '<th>Remark</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${job.equipment.map((eq, index) => `
                <tr>
                  ${pdfSettings.equipmentTableColumns.no ? `<td>${eq.no || index + 1}</td>` : ''}
                  ${pdfSettings.equipmentTableColumns.name ? `<td>${eq.name || '-'}</td>` : ''}
                  ${pdfSettings.equipmentTableColumns.manufacturer ? `<td>${eq.manufacturer || '-'}</td>` : ''}
                  ${pdfSettings.equipmentTableColumns.model ? `<td>${eq.model || '-'}</td>` : ''}
                  ${pdfSettings.equipmentTableColumns.serialNumber ? `<td>${eq.serialNumber || '-'}</td>` : ''}
                  ${pdfSettings.equipmentTableColumns.calibrationPoint ? `<td>${eq.calibrationPoint || '-'}</td>` : ''}
                  ${pdfSettings.equipmentTableColumns.calibrationMethods ? `<td>${eq.calibrationMethods || '-'}</td>` : ''}
                  ${pdfSettings.equipmentTableColumns.accessories ? `<td>${eq.accessories || '-'}</td>` : ''}
                  ${pdfSettings.equipmentTableColumns.machineLocation ? `<td>${eq.machineLocation || '-'}</td>` : ''}
                  ${pdfSettings.equipmentTableColumns.remark ? `<td>${eq.remark || '-'}</td>` : ''}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
      
      ${job.comments ? `
        <div class="notes">
          <h3>Notes</h3>
          <p>${job.comments}</p>
        </div>
      ` : ''}
      
      ${pdfSettings.showFooter ? `
        <div class="footer" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-top: 1px solid #bdc3c7; margin-top: 20px;">
          <div style="flex: 1; text-align: left; font-size: ${pdfSettings.fontSize?.small || 10}pt;">
            ${replacePlaceholders(pdfSettings.footerContent?.left || '', job, settings.companyInfo)}
          </div>
          <div style="flex: 1; text-align: center; font-size: ${pdfSettings.fontSize?.small || 10}pt;">
            ${replacePlaceholders(pdfSettings.footerContent?.center || '', job, settings.companyInfo)}
          </div>
          <div style="flex: 1; text-align: right; font-size: ${pdfSettings.fontSize?.small || 10}pt;">
            ${replacePlaceholders(pdfSettings.footerContent?.right || '', job, settings.companyInfo)}
          </div>
        </div>
      ` : ''}
    </body>
    </html>
  `;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'PDF Server is running' });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`PDF Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Server is ready to accept connections`);
});

// Handle server errors
server.on('error', (error) => {
  console.error('Server error:', error);
});

// Handle process termination
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
