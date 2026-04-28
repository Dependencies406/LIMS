import { useCallback, useEffect, useRef, useState } from 'react';
import type { Job, DocumentIndexItem } from '../types';
import type { PdfTemplate, PdfTemplateScope } from '../modules/pdf-template-builder/types';
import { pdfTemplateRenderer } from '../services/pdfTemplateRenderer';
import { pdfDataResolver, type MissingDataReport } from '../services/pdfDataResolver';
import { documentsTemplatePrintService } from '../services/documentsTemplatePrintService';

type Mode = 'job' | 'documents';

interface Params {
  mode: Mode;
  job?: Job;
  selectedEquipmentIndex?: number;
  documentIndexItems?: DocumentIndexItem[];
  /** When provided, the TemplateSelectorModal will filter to this scope + global templates. */
  scope?: PdfTemplateScope;
}

export function useTemplatePdfWorkflow({ mode, job, selectedEquipmentIndex, documentIndexItems, scope }: Params) {
  const [selectedTemplate, setSelectedTemplate] = useState<PdfTemplate | null>(null);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showMissingDataWarning, setShowMissingDataWarning] = useState(false);
  const [missingData, setMissingData] = useState<MissingDataReport[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const generatingRef = useRef(false);

  const cleanupPreviewUrl = useCallback(() => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  useEffect(() => () => cleanupPreviewUrl(), [cleanupPreviewUrl]);

  const generatePreview = useCallback(async (template: PdfTemplate, continueWithNA: boolean) => {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setIsGenerating(true);
    setError(null);
    setInfoMessage(null);
    try {
      let blob: Blob;
      let resultMissing: MissingDataReport[] = [];
      if (mode === 'documents') {
        const result = await documentsTemplatePrintService.generatePdfBlob(
          template,
          documentIndexItems
            ? { continueWithNA, documentIndexItems }
            : { continueWithNA }
        );
        blob = result.blob;
        resultMissing = result.missingData;
      } else {
        if (!job) throw new Error('Job context missing.');
        const result = await pdfTemplateRenderer.renderTemplate(template, job, {
          showMissingDataAsNA: continueWithNA,
          missingDataLabel: 'N/A',
          selectedEquipmentIndex,
        });
        blob = result.pdf.output('blob');
        resultMissing = result.missingData;
      }
      if (!blob) throw new Error('Failed to generate PDF.');
      setMissingData(resultMissing);
      cleanupPreviewUrl();
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate PDF.');
    } finally {
      generatingRef.current = false;
      setIsGenerating(false);
    }
  }, [cleanupPreviewUrl, job, mode, selectedEquipmentIndex, documentIndexItems]);

  const validateTemplate = useCallback(async (template: PdfTemplate) => {
    if (mode === 'documents') {
      return documentsTemplatePrintService.validateTemplate(
        template,
        documentIndexItems ? { documentIndexItems } : undefined
      );
    }
    if (!job) throw new Error('Job context missing.');
    const prepared = await pdfTemplateRenderer.prepareJobDataForPdf(job);
    return pdfDataResolver.validateTemplate(template, prepared as any, selectedEquipmentIndex);
  }, [job, mode, selectedEquipmentIndex, documentIndexItems]);

  const handleTemplateSelect = useCallback(async (template: PdfTemplate) => {
    setSelectedTemplate(template);
    setShowTemplateSelector(false);
    setError(null);
    setInfoMessage(null);
    const missing = await validateTemplate(template);
    setMissingData(missing);
    if (missing.length > 0) {
      setShowMissingDataWarning(true);
      return;
    }
    await generatePreview(template, false);
  }, [generatePreview, validateTemplate]);

  const handleContinueWithNA = useCallback(async () => {
    if (!selectedTemplate) return;
    setShowMissingDataWarning(false);
    await generatePreview(selectedTemplate, true);
  }, [generatePreview, selectedTemplate]);

  const printPreview = useCallback(() => {
    if (!previewUrl) return;
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) {
      setInfoMessage('Popup blocked. You can still Download PDF.');
      return;
    }
    win.document.write(`
      <!doctype html>
      <html><head><title>Print PDF</title></head>
      <body style="margin:0">
        <iframe id="print-frame" src="${previewUrl}" style="border:0;width:100vw;height:100vh"></iframe>
      </body></html>
    `);
    win.document.close();
    const frame = win.document.getElementById('print-frame') as HTMLIFrameElement | null;
    const doPrint = () => {
      try {
        win.focus();
        win.print();
      } catch {
        setInfoMessage('Popup blocked. You can still Download PDF.');
      }
    };
    if (frame) frame.onload = doPrint;
    window.setTimeout(doPrint, 1000);
  }, [previewUrl]);

  const downloadPreview = useCallback((fileName: string) => {
    if (!previewUrl) return;
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [previewUrl]);

  const reset = useCallback(() => {
    setSelectedTemplate(null);
    setShowTemplateSelector(false);
    setShowMissingDataWarning(false);
    setMissingData([]);
    setError(null);
    setInfoMessage(null);
    cleanupPreviewUrl();
  }, [cleanupPreviewUrl]);

  return {
    /** Pass to <TemplateSelectorModal scope={...}> to filter templates. */
    scope,
    selectedTemplate,
    showTemplateSelector,
    setShowTemplateSelector,
    showMissingDataWarning,
    setShowMissingDataWarning,
    missingData,
    previewUrl,
    isGenerating,
    error,
    infoMessage,
    handleTemplateSelect,
    handleContinueWithNA,
    printPreview,
    downloadPreview,
    reset,
  };
}

