/**
 * Formula Verification Modal
 * Displays step-by-step formula calculation verification
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Modal, ModalFooter, Button, LoadingSpinner } from './common';
import type { SpreadsheetModel } from '../modules/spreadsheet/models/SpreadsheetModel';
import { getSpreadsheetColumnDefinitions, getSpreadsheetColumnOrder } from '../modules/spreadsheet/utils/tabMigration';
import { verifyRowFormulas, type RowVerification, type StepApproval } from '../services/formulaVerificationService';

function columnLetterToIndex(letter: string): number {
  let index = 0;
  const upperLetter = letter.toUpperCase();
  for (let i = 0; i < upperLetter.length; i++) {
    index = index * 26 + (upperLetter.charCodeAt(i) - 64);
  }
  return index - 1;
}
import { generateFormulaVerificationPdf } from '../services/formulaVerificationPdfService';
import { PdfPreviewModal } from './PdfPreviewModal';
import { SignatureCanvas } from './SignatureCanvas';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../contexts/AuthContext';
import type { DigitalSignature } from '../types';
import jsPDF from 'jspdf';

export interface FormulaVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  spreadsheet: SpreadsheetModel | null;
  rowIndex: number;
  templateName?: string;
  job?: any; // Job type
}

export const FormulaVerificationModal: React.FC<FormulaVerificationModalProps> = ({
  isOpen,
  onClose,
  spreadsheet,
  rowIndex,
  templateName,
  job,
}) => {
  const { success, error: showError } = useToast();
  const { currentUser } = useAuth();
  const [verification, setVerification] = useState<RowVerification | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [previewPdf, setPreviewPdf] = useState<jsPDF | null>(null);
  const [previewFileName, setPreviewFileName] = useState('');
  
  // Approval state: Map of "formulaIndex-stepNumber" -> approval data
  const [stepApprovals, setStepApprovals] = useState<Map<string, StepApproval>>(new Map());
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [pendingApprovalKey, setPendingApprovalKey] = useState<string | null>(null);
  const [pendingSignature, setPendingSignature] = useState<DigitalSignature | undefined>(undefined);

  useEffect(() => {
    if (isOpen && spreadsheet) {
      loadVerification();
    } else {
      setVerification(null);
      setError(null);
    }
  }, [isOpen, spreadsheet, rowIndex]);

  const loadVerification = async () => {
    if (!spreadsheet) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await verifyRowFormulas(spreadsheet, rowIndex);
      setVerification(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify formulas');
      console.error('Formula verification error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportPdf = async () => {
    if (!verification) return;

    setIsExportingPdf(true);
    try {
      // Merge approvals into verification before generating PDF
      const verificationWithApprovals = {
        ...verification,
        formulaVerifications: verification.formulaVerifications.map((formulaVer, formulaIdx) => ({
          ...formulaVer,
          calculationSteps: formulaVer.calculationSteps.map(step => {
            const approvalKey = `${formulaIdx}-${step.step}`;
            const approval = stepApprovals.get(approvalKey);
            return {
              ...step,
              approval: approval || step.approval,
            };
          }),
        })),
      };
      
      const pdf = await generateFormulaVerificationPdf(verificationWithApprovals, {
        templateName,
        job,
      });

      // Generate filename
      const dateStr = new Date().toISOString().split('T')[0];
      const fileName = `Formula_Verification_Row${verification.rowIndex + 1}_${dateStr}.pdf`;

      // Show preview instead of downloading directly
      setPreviewPdf(pdf);
      setPreviewFileName(fileName);
      setShowPdfPreview(true);
    } catch (err) {
      console.error('Error generating PDF:', err);
      showError(err instanceof Error ? err.message : 'Failed to export PDF. Please try again.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleDownloadPdf = useCallback(() => {
    if (previewPdf && previewFileName) {
      previewPdf.save(previewFileName);
      success('Formula verification PDF downloaded successfully');
    }
  }, [previewPdf, previewFileName, success]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Formula Verification - Row ${rowIndex + 1}`}
      size="xlarge"
    >
      <div className="space-y-6 max-h-[70vh] overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <LoadingSpinner size="lg" />
            <span className="ml-3 text-gray-600">Analyzing formulas...</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {verification && !loading && (() => {
          const columnOrder = spreadsheet ? getSpreadsheetColumnOrder(spreadsheet) || [] : [];
          const columnDefs = spreadsheet ? getSpreadsheetColumnDefinitions(spreadsheet) || new Map() : new Map();
          return (
          <>
            {/* Row Data Summary - column name then column value (formula ref) after it */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-3 text-lg">Row {rowIndex + 1} Data</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {Array.from(verification.rowData.entries()).map(([colName, data]) => {
                  const colDef = columnDefs.get(colName);
                  const displayName = colDef?.name ?? colName;
                  const columnValue = colDef?.columnValue ?? colName;
                  const label = columnValue !== displayName ? `${displayName} (${columnValue})` : displayName;
                  return (
                    <div key={colName} className="text-sm bg-white p-2 rounded border border-gray-200">
                      <span className="font-medium text-gray-700">{label}:</span>{' '}
                      <span className="text-gray-900 font-mono">{data.displayValue || 'N/A'}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Formula Verifications */}
            {verification.formulaVerifications.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p>No formulas found in this row</p>
              </div>
            ) : (
              verification.formulaVerifications.map((formulaVer, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-5 bg-white shadow-sm">
                  <h4 className="font-semibold text-lg text-gray-900 mb-4 flex items-center">
                    <svg className="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {formulaVer.columnName}
                  </h4>

                  {/* Formula Expression */}
                  <div className="mb-4 p-3 bg-blue-50 rounded border border-blue-200">
                    <div className="text-sm text-gray-600 mb-1 font-medium">Formula:</div>
                    <code className="text-sm font-mono text-blue-900 bg-white px-2 py-1 rounded border border-blue-300">
                      {formulaVer.formula}
                    </code>
                  </div>

                  {/* Input Values - column name then column value (ref) after it */}
                  {formulaVer.inputValues.size > 0 && (
                    <div className="mb-4">
                      <div className="text-sm font-medium text-gray-700 mb-2">Input Values:</div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {Array.from(formulaVer.inputValues.entries()).map(([ref, data]) => {
                          const colIndex = columnLetterToIndex(ref);
                          const displayName = colIndex >= 0 && colIndex < columnOrder.length ? columnOrder[colIndex] : ref;
                          const label = displayName !== ref ? `${displayName} (${ref})` : ref;
                          return (
                            <div key={ref} className="text-sm bg-gray-50 p-2 rounded border border-gray-200">
                              <span className="font-mono text-gray-600 font-semibold">{label}:</span>{' '}
                              <span className="text-gray-900">{data.displayValue || 'N/A'}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Calculation Steps */}
                  <div className="mb-4">
                    <div className="text-sm font-medium text-gray-700 mb-3">Calculation Steps:</div>
                    <div className="space-y-3">
                      {formulaVer.calculationSteps.map((step) => {
                        const approvalKey = `${idx}-${step.step}`;
                        const approval = stepApprovals.get(approvalKey) || step.approval;
                        const isApproved = !!approval;
                        
                        return (
                          <div key={step.step} className={`border-l-4 ${isApproved ? 'border-green-500' : 'border-blue-500'} pl-4 py-2 bg-gray-50 rounded-r`}>
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center mb-1">
                                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${isApproved ? 'bg-green-500' : 'bg-blue-500'} text-white text-xs font-semibold mr-2`}>
                                    {step.step}
                                  </span>
                                  <span className="text-sm font-semibold text-blue-700">
                                    {step.description}
                                  </span>
                                  {isApproved && (
                                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                      ✓ Approved
                                    </span>
                                  )}
                                </div>
                                {step.expression && (
                                  <code className="text-sm font-mono text-gray-800 block mb-2 mt-1 bg-white px-2 py-1 rounded border border-gray-300">
                                    {step.expression}
                                  </code>
                                )}
                                {step.result !== null && step.result !== undefined && (
                                  <div className="text-sm font-semibold text-green-700 bg-green-50 px-2 py-1 rounded border border-green-200 inline-block">
                                    Result: {String(step.result)}
                                  </div>
                                )}
                                {step.subSteps && step.subSteps.length > 0 && (
                                  <div className="mt-2 ml-8 space-y-1">
                                    {step.subSteps.map((subStep, subIdx) => (
                                      <div key={subIdx} className="text-xs text-gray-600 flex items-start">
                                        <span className="text-blue-500 mr-2">•</span>
                                        <span>{subStep.description}</span>
                                        {subStep.result !== null && subStep.result !== undefined && (
                                          <span className="ml-2 text-green-600 font-semibold">
                                            = {String(subStep.result)}
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                
                                {/* Approval Information */}
                                {isApproved && approval && (
                                  <div className="mt-3 pt-3 border-t border-gray-300">
                                    <div className="flex items-start gap-4">
                                      {/* Signature */}
                                      {approval.signatureData && (
                                        <div className="flex-shrink-0">
                                          <div className="text-xs text-gray-600 mb-1">Signature:</div>
                                          <img 
                                            src={approval.signatureData} 
                                            alt="Reviewer signature" 
                                            className="h-12 w-32 border border-gray-300 bg-white rounded"
                                          />
                                        </div>
                                      )}
                                      
                                      {/* Reviewer Name */}
                                      <div className="flex-1">
                                        <div className="text-xs text-gray-600 mb-1">Reviewer:</div>
                                        <div className="text-sm font-medium text-gray-900">{approval.reviewerName}</div>
                                      </div>
                                      
                                      {/* Date */}
                                      <div className="flex-1">
                                        <div className="text-xs text-gray-600 mb-1">Date:</div>
                                        <div className="text-sm font-medium text-gray-900">
                                          {new Date(approval.approvedDate).toLocaleString()}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                                
                                {/* Approve Button */}
                                {!isApproved && (
                                  <div className="mt-3">
                                    <Button
                                      variant="primary"
                                      size="sm"
                                      onClick={() => {
                                        setPendingApprovalKey(approvalKey);
                                        setPendingSignature(undefined);
                                        setShowSignatureModal(true);
                                      }}
                                    >
                                      Approve Step
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Final Result */}
                  <div className={`p-3 rounded border ${
                    formulaVer.error 
                      ? 'bg-red-50 border-red-200' 
                      : 'bg-green-50 border-green-200'
                  }`}>
                    <div className="text-sm text-gray-600 mb-1 font-medium">Final Result:</div>
                    <div className={`text-lg font-semibold ${
                      formulaVer.error ? 'text-red-900' : 'text-green-900'
                    }`}>
                      {formulaVer.displayValue}
                    </div>
                    {formulaVer.error && (
                      <div className="mt-2 text-sm text-red-600 font-medium">
                        ⚠️ Error: {formulaVer.error}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </>
          );
        })()}
      </div>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        {verification && verification.formulaVerifications.length > 0 && (
          <>
            <Button 
              variant="secondary" 
              onClick={loadVerification}
              disabled={loading}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              onClick={handleExportPdf}
              disabled={isExportingPdf || !verification}
            >
              {isExportingPdf ? (
                <>
                  <LoadingSpinner size="sm" inline className="mr-2" />
                  Exporting...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.414 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  Export PDF
                </>
              )}
            </Button>
          </>
        )}
      </ModalFooter>

      {/* PDF Preview Modal */}
      <PdfPreviewModal
        isOpen={showPdfPreview}
        onClose={() => {
          setShowPdfPreview(false);
          setPreviewPdf(null);
          setPreviewFileName('');
        }}
        pdf={previewPdf}
        fileName={previewFileName}
        onDownload={handleDownloadPdf}
      />

      {/* Signature Modal for Step Approval */}
      <Modal
        isOpen={showSignatureModal}
        onClose={() => {
          setShowSignatureModal(false);
          setPendingApprovalKey(null);
          setPendingSignature(undefined);
        }}
        title="Approve Calculation Step"
        size="medium"
      >
        <div className="p-6">
          <p className="text-sm text-gray-600 mb-4">
            Please sign to approve this calculation step. The signature, your name, and the current date will be recorded.
          </p>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Signature:
            </label>
            <SignatureCanvas
              value={pendingSignature}
              onChange={setPendingSignature}
              signerName={currentUser?.displayName || currentUser?.email || ''}
              required
              skipConsent={true}
            />
          </div>
        </div>
        
        <ModalFooter>
          <Button
            variant="secondary"
            onClick={() => {
              setShowSignatureModal(false);
              setPendingApprovalKey(null);
              setPendingSignature(undefined);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (!pendingSignature || !pendingApprovalKey || !currentUser) {
                showError('Please provide a signature to approve this step.');
                return;
              }

              // Create approval record
              const approval: StepApproval = {
                signatureData: pendingSignature.signatureData,
                reviewerName: pendingSignature.signerName || currentUser.displayName || currentUser.email || 'Unknown',
                approvedDate: pendingSignature.signedDate || new Date(),
              };

              // Save approval
              setStepApprovals(prev => {
                const newMap = new Map(prev);
                newMap.set(pendingApprovalKey, approval);
                return newMap;
              });

              // Update verification with approval
              if (verification) {
                const [formulaIdx, stepNum] = pendingApprovalKey.split('-');
                const formulaIndex = parseInt(formulaIdx);
                const stepNumber = parseInt(stepNum);
                
                const updatedVerification = { ...verification };
                if (updatedVerification.formulaVerifications[formulaIndex]) {
                  const step = updatedVerification.formulaVerifications[formulaIndex].calculationSteps.find(s => s.step === stepNumber);
                  if (step) {
                    step.approval = approval;
                  }
                }
                setVerification(updatedVerification);
              }

              success('Step approved successfully');
              setShowSignatureModal(false);
              setPendingApprovalKey(null);
              setPendingSignature(undefined);
            }}
            disabled={!pendingSignature}
          >
            Confirm Approval
          </Button>
        </ModalFooter>
      </Modal>
    </Modal>
  );
};
