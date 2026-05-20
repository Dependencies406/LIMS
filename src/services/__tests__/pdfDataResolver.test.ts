/**
 * Unit tests for PDF Data Resolver
 */

import { describe, it, expect } from 'vitest';
import { pdfDataResolver } from '../pdfDataResolver';
import type { Job } from '../../types';
import type { PdfTemplate, TextElement, DocumentsTableElement } from '../../modules/pdf-template-builder/types';

describe('PdfDataResolver', () => {
  const mockJob: Job = {
    id: 'job1',
    jobId: 'JOB-001',
    title: 'Test Job',
    status: 'Completed',
    customerCode: 'CUST-001',
    customerName: 'Test Customer',
    customerAddress: '123 Test St',
    equipment: [
      {
        id: 'eq1',
        name: 'Test Equipment',
        model: 'Model X',
        serialNumber: 'SN123',
      },
    ],
    appointmentDate: '2024-01-01',
    created: new Date('2024-01-01'),
    assignedStaff: [],
  } as Job;

  /** Shape aligned with pdfTemplateRenderer.prepareJobData (nested job / customer). */
  const preparedFrom = (job: Job, extra: Record<string, unknown> = {}) =>
    ({
      ...job,
      job: {
        id: job.jobId,
        title: job.title,
        status: job.status,
        customer: job.customerName,
        appointmentDate: job.appointmentDate,
      },
      customer: {
        name: job.customerName,
        address: job.customerAddress || '',
      },
      equipment: job.equipment || [],
      ...extra,
    }) as any;

  describe('resolveDataSource', () => {
    it('should resolve simple job properties', () => {
      const result = pdfDataResolver.resolveDataSource('job.id', preparedFrom(mockJob));
      expect(result.exists).toBe(true);
      expect(result.value).toBe('JOB-001');
      expect(result.isValid).toBe(true);
    });

    it('should resolve nested properties', () => {
      const result = pdfDataResolver.resolveDataSource('customer.name', preparedFrom(mockJob));
      expect(result.exists).toBe(true);
      expect(result.value).toBe('Test Customer');
      expect(result.isValid).toBe(true);
    });

    it('should handle missing properties', () => {
      const result = pdfDataResolver.resolveDataSource('job.nonExistent', preparedFrom(mockJob));
      expect(result.exists).toBe(false);
      expect(result.isValid).toBe(false);
    });

    it('should resolve equipment array properties', () => {
      const result = pdfDataResolver.resolveDataSource('equipment[0].name', preparedFrom(mockJob), 0);
      expect(result.exists).toBe(true);
      expect(result.value).toBe('Test Equipment');
      expect(result.isValid).toBe(true);
    });

    it('should handle null values', () => {
      const jobWithNull = { ...mockJob, customerName: null } as Job;
      const result = pdfDataResolver.resolveDataSource('customer.name', preparedFrom(jobWithNull));
      expect(result.exists).toBe(true);
      expect(result.isNull).toBe(true);
      expect(result.isValid).toBe(false);
    });

    it('should handle empty strings', () => {
      const jobWithEmpty = { ...mockJob, title: '' } as Job;
      const result = pdfDataResolver.resolveDataSource('job.title', preparedFrom(jobWithEmpty));
      expect(result.exists).toBe(true);
      expect(result.isEmpty).toBe(true);
      expect(result.isValid).toBe(false);
    });

    it('should resolve documentIndex.list from prepared jobData (empty array is valid)', () => {
      const prepared = preparedFrom(mockJob, { documentIndexItems: [] as unknown[] });
      const r = pdfDataResolver.resolveDataSource('documentIndex.list', prepared as any);
      expect(r.isValid).toBe(true);
      expect(r.value).toEqual([]);
    });

    it('should resolve documentIndex.list when items exist', () => {
      const rows = [{ id: '1', documentCode: 'QP-01' }];
      const prepared = preparedFrom(mockJob, { documentIndexItems: rows });
      const r = pdfDataResolver.resolveDataSource('documentIndex.list', prepared as any);
      expect(r.isValid).toBe(true);
      expect(r.value).toEqual(rows);
    });

    it('should be invalid for documentIndex.list on raw job without documentIndexItems', () => {
      const r = pdfDataResolver.resolveDataSource('documentIndex.list', mockJob);
      expect(r.isValid).toBe(false);
    });

    it('should resolve legacy company.logoBase64 key as company.logo', () => {
      const prepared = preparedFrom(mockJob, { company: { logo: 'base64-xyz' } });
      const r1 = pdfDataResolver.resolveDataSource('company.logo', prepared as any);
      const r2 = pdfDataResolver.resolveDataSource('company.logoBase64', prepared as any);

      expect(r1.isValid).toBe(true);
      expect(r2.isValid).toBe(true);
      expect(r2.value).toBe(r1.value);
    });

    it('should resolve request-form fields from prepared jobData', () => {
      const prepared = preparedFrom(mockJob, {
        job: {
          id: mockJob.jobId,
          requestNo: 'SR-2026-0012',
          appointmentDate: '2026-04-24',
        },
        service: {
          decisionRule: 'Guard band 95% confidence',
        },
        equipment: [
          {
            ...(mockJob.equipment?.[0] as any),
            assetTag: 'ASSET-77',
          },
        ],
      });

      expect(pdfDataResolver.resolveDataSource('job.appointmentDate', prepared as any).value).toBe('2026-04-24');
      expect(pdfDataResolver.resolveDataSource('service.decisionRule', prepared as any).value).toBe('Guard band 95% confidence');
      expect(pdfDataResolver.resolveDataSource('equipment.assetTag', prepared as any, 0).value).toBe('ASSET-77');
    });
  });

  describe('validateTemplate', () => {
    it('should detect missing data in template', () => {
      const template: PdfTemplate = {
        name: 'Test Template',
        description: '',
        pageSize: 'A4',
        elements: [
          {
            id: 'el1',
            type: 'text',
            x: 10,
            y: 10,
            dataSource: { type: 'text', key: 'job.id' },
          } as TextElement,
          {
            id: 'el2',
            type: 'text',
            x: 10,
            y: 20,
            dataSource: { type: 'text', key: 'job.missingProperty' },
          } as TextElement,
        ],
      };

      const missing = pdfDataResolver.validateTemplate(template, preparedFrom(mockJob));
      expect(missing.length).toBe(1);
      expect(missing[0].elementId).toBe('el2');
      expect(missing[0].dataSource).toBe('job.missingProperty');
    });

    it('should return empty array when all data exists', () => {
      const template: PdfTemplate = {
        name: 'Test Template',
        description: '',
        pageSize: 'A4',
        elements: [
          {
            id: 'el1',
            type: 'text',
            x: 10,
            y: 10,
            dataSource: { type: 'text', key: 'job.id' },
          } as TextElement,
          {
            id: 'el2',
            type: 'text',
            x: 10,
            y: 20,
            dataSource: { type: 'text', key: 'customer.name' },
          } as TextElement,
        ],
      };

      const missing = pdfDataResolver.validateTemplate(template, preparedFrom(mockJob));
      expect(missing.length).toBe(0);
    });

    it('should handle elements without dataSource', () => {
      const template: PdfTemplate = {
        name: 'Test Template',
        description: '',
        pageSize: 'A4',
        elements: [
          {
            id: 'el1',
            type: 'text',
            x: 10,
            y: 10,
            staticText: 'Static text',
          } as TextElement,
        ],
      };

      const missing = pdfDataResolver.validateTemplate(template, preparedFrom(mockJob));
      expect(missing.length).toBe(0);
    });

    it('should not flag documents-table documentIndex.list as missing when jobData is prepared', () => {
      const prepared = preparedFrom(mockJob, { documentIndexItems: [] });
      const template: PdfTemplate = {
        name: 'T',
        description: '',
        pageSize: 'A4',
        elements: [
          {
            id: 'dt1',
            type: 'documents-table',
            x: 10,
            y: 10,
            columns: [],
            dataSource: { type: 'documentIndex', key: 'documentIndex.list' },
          } as DocumentsTableElement,
        ],
      };
      const missing = pdfDataResolver.validateTemplate(template, prepared);
      expect(missing.filter((m) => m.dataSource === 'documentIndex.list')).toHaveLength(0);
    });
  });

  describe('resolveTemplateData', () => {
    it('should resolve all data sources in template', () => {
      const template: PdfTemplate = {
        name: 'Test Template',
        description: '',
        pageSize: 'A4',
        elements: [
          {
            id: 'el1',
            type: 'text',
            x: 10,
            y: 10,
            dataSource: { type: 'text', key: 'job.id' },
          } as TextElement,
          {
            id: 'el2',
            type: 'text',
            x: 10,
            y: 20,
            dataSource: { type: 'text', key: 'customer.name' },
          } as TextElement,
        ],
      };

      const resolved = pdfDataResolver.resolveTemplateData(template, preparedFrom(mockJob));
      expect(resolved.get('el1')).toBe('JOB-001');
      expect(resolved.get('el2')).toBe('Test Customer');
    });
  });
});
