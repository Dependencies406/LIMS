import type { DocumentIndexItem, DocumentSource } from '../types';
import ExcelJS from 'exceljs';

const formatDate = (d: Date | undefined): string => {
  if (!d) return '';
  const t = d instanceof Date ? d.getTime() : NaN;
  if (Number.isNaN(t)) return '';
  return new Date(t).toISOString().slice(0, 10);
};

const sourceToUrl = (src: DocumentSource | undefined): string => {
  if (!src) return '';
  return src.url || '';
};

const buildFilename = () => `documents_index_${new Date().toISOString().slice(0, 10)}.xlsx`;

export async function exportDocumentIndexToExcel(items: DocumentIndexItem[]): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Documents');

  sheet.columns = [
    { header: 'Document Code', key: 'documentCode', width: 18 },
    { header: 'Type', key: 'type', width: 22 },
    { header: 'Revision', key: 'revisionNumber', width: 10 },
    { header: 'Document Name', key: 'documentName', width: 45 },
    { header: 'Tags', key: 'tags', width: 28 },
    { header: 'Effective Date', key: 'effectiveDate', width: 14 },
    { header: 'DAR Number', key: 'darNumber', width: 14 },
    { header: 'Document URL', key: 'documentUrl', width: 55 },
    { header: 'DAR URL', key: 'darUrl', width: 55 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.height = 22;

  for (const it of items) {
    sheet.addRow({
      documentCode: it.documentCode || '',
      type: it.type || '',
      revisionNumber: it.revisionNumber || '',
      documentName: it.documentName || '',
      tags: (it.tags || []).join(', '),
      effectiveDate: formatDate(it.effectiveDate),
      darNumber: it.darNumber || '',
      documentUrl: sourceToUrl(it.source),
      darUrl: sourceToUrl(it.darSource),
    });
  }

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columns.length },
  };

  sheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
      if (rowNumber > 1) {
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      }
    });
    if (rowNumber > 1) row.height = 18;
  });

  // Make URLs clickable (Excel will render hyperlinks)
  // NOTE: In some ExcelJS builds, Column#getCell is not available.
  // Use row/cell addressing for broad compatibility.
  const documentUrlColIndex = 8;
  const darUrlColIndex = 9;
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const docCell = row.getCell(documentUrlColIndex);
    const darCell = row.getCell(darUrlColIndex);
    if (typeof docCell.value === 'string' && docCell.value) docCell.value = { text: docCell.value, hyperlink: docCell.value };
    if (typeof darCell.value === 'string' && darCell.value) darCell.value = { text: darCell.value, hyperlink: darCell.value };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = buildFilename();
  link.click();
  URL.revokeObjectURL(url);
}

