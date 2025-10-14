import { useState, useEffect, useCallback } from 'react';
import type { Customer } from '../types';
import { customerService, type CustomerInput } from '../services/customerService';

/**
 * Custom hook for managing customer data
 * Provides real-time customer updates and CRUD operations
 */
export const useCustomers = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to real-time customer updates
  useEffect(() => {
    const unsubscribe = customerService.subscribeToCustomers((updatedCustomers, err) => {
      if (err) {
        setError('Failed to load customers');
        setCustomers([]);
      } else {
        setCustomers(updatedCustomers);
        setError(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  /**
   * Create a new customer
   */
  const createCustomer = useCallback(async (data: CustomerInput): Promise<string> => {
    setError(null);
    try {
      const customerCode = await customerService.createCustomer(data);
      return customerCode;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create customer';
      setError(message);
      throw err;
    }
  }, []);

  /**
   * Update an existing customer
   */
  const updateCustomer = useCallback(
    async (customerCode: string, data: Partial<Omit<CustomerInput, 'customerCode'>>): Promise<void> => {
      setError(null);
      try {
        await customerService.updateCustomer(customerCode, data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update customer';
        setError(message);
        throw err;
      }
    },
    []
  );

  /**
   * Delete a customer
   */
  const deleteCustomer = useCallback(async (customerCode: string): Promise<void> => {
    setError(null);
    try {
      await customerService.deleteCustomer(customerCode);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete customer';
      setError(message);
      throw err;
    }
  }, []);

  /**
   * Get a single customer by code
   */
  const getCustomerByCode = useCallback(async (customerCode: string): Promise<Customer> => {
    setError(null);
    try {
      return await customerService.getCustomerByCode(customerCode);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch customer';
      setError(message);
      throw err;
    }
  }, []);

  /**
   * Generate a unique customer code
   */
  const generateCustomerCode = useCallback(async () => {
    return await customerService.generateCustomerCode();
  }, []);

  /**
   * Search customers
   */
  const searchCustomers = useCallback(
    (searchTerm: string) => {
      return customerService.searchCustomers(customers, searchTerm);
    },
    [customers]
  );

  return {
    customers,
    loading,
    error,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    getCustomerByCode,
    generateCustomerCode,
    searchCustomers,
  };
};

