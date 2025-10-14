import type { Customer } from '../types';
import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  onSnapshot
} from './firebase';

export interface CustomerInput {
  customerCode: string;
  name: string;
  contact: string;
  address: string;
  email?: string;
  phone?: string;
}

/**
 * Service for managing customer-related operations
 * Provides CRUD operations and real-time subscriptions
 */
export const customerService = {
  /**
   * Subscribe to real-time customer updates
   * @param callback Function called when customers change
   * @returns Unsubscribe function
   */
  subscribeToCustomers(
    callback: (customers: Customer[], error?: Error) => void
  ): () => void {
    const q = query(collection(db, 'customers'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const customers = snapshot.docs.map((doc) => ({
          id: doc.id,
          customerCode: doc.id, // Document ID is the customer code
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate() || new Date(),
          updatedAt: doc.data().updatedAt?.toDate() || new Date(),
        })) as Customer[];
        
        callback(customers);
      },
      (error) => {
        console.error('Error loading customers:', error);
        callback([], error as Error);
      }
    );

    return unsubscribe;
  },

  /**
   * Get all customers (one-time fetch)
   * @returns Promise with array of customers
   */
  async getAllCustomers(): Promise<Customer[]> {
    try {
      const q = query(collection(db, 'customers'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        customerCode: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
      })) as Customer[];
    } catch (error) {
      console.error('Error fetching customers:', error);
      throw new Error('Failed to fetch customers');
    }
  },

  /**
   * Get a single customer by code
   * @param customerCode Customer code (document ID)
   * @returns Promise with customer data
   */
  async getCustomerByCode(customerCode: string): Promise<Customer> {
    try {
      const customerDoc = await getDoc(doc(db, 'customers', customerCode));
      
      if (!customerDoc.exists()) {
        throw new Error('Customer not found');
      }

      return {
        id: customerDoc.id,
        customerCode: customerDoc.id,
        ...customerDoc.data(),
        createdAt: customerDoc.data().createdAt?.toDate() || new Date(),
        updatedAt: customerDoc.data().updatedAt?.toDate() || new Date(),
      } as Customer;
    } catch (error) {
      console.error('Error fetching customer:', error);
      throw error;
    }
  },

  /**
   * Create a new customer
   * @param data Customer input data
   * @returns Promise with customer code
   */
  async createCustomer(data: CustomerInput): Promise<string> {
    try {
      const customerData = {
        name: data.name,
        contact: data.contact,
        address: data.address,
        email: data.email || '',
        phone: data.phone || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // Use customer code as document ID
      await setDoc(doc(db, 'customers', data.customerCode), customerData);

      // Update the counter for the next customer
      await this.updateCustomerCounter(data.customerCode);

      return data.customerCode;
    } catch (error) {
      console.error('Error creating customer:', error);
      throw error;
    }
  },

  /**
   * Update an existing customer
   * @param customerCode Customer code (document ID)
   * @param data Partial customer data to update
   */
  async updateCustomer(
    customerCode: string,
    data: Partial<Omit<CustomerInput, 'customerCode'>>
  ): Promise<void> {
    try {
      const updateData = {
        ...data,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, 'customers', customerCode), updateData);
    } catch (error) {
      console.error('Error updating customer:', error);
      throw error;
    }
  },

  /**
   * Delete a customer
   * @param customerCode Customer code (document ID)
   */
  async deleteCustomer(customerCode: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'customers', customerCode));
    } catch (error) {
      console.error('Error deleting customer:', error);
      throw error;
    }
  },

  /**
   * Generate a unique customer code
   * @returns Promise with customer code in format CM-YYXXX
   */
  async generateCustomerCode(): Promise<string> {
    try {
      const currentYear = new Date().getFullYear().toString().slice(-2);
      
      const settingsDoc = await getDoc(doc(db, 'settings', 'customerCounter'));
      let counter = 1;
      
      if (settingsDoc.exists()) {
        const data = settingsDoc.data();
        counter = (data.counter || 0) + 1;
      }
      
      // Format: CM-YYXXX (e.g., CM-25008)
      const customerCode = `CM-${currentYear}${counter.toString().padStart(3, '0')}`;
      return customerCode;
    } catch (error) {
      console.error('Error generating customer code:', error);
      
      // Fallback to random code if counter fails
      const randomStr = Math.random().toString(36).substring(2, 5).toUpperCase();
      const currentYear = new Date().getFullYear().toString().slice(-2);
      return `CM-${currentYear}${randomStr}`;
    }
  },

  /**
   * Update the customer counter in settings
   * @param customerCode The customer code to extract counter from
   */
  async updateCustomerCounter(customerCode: string): Promise<void> {
    try {
      const currentYear = new Date().getFullYear().toString().slice(-2);
      const counterPart = customerCode.slice(-3);
      const counter = parseInt(counterPart);
      
      if (!isNaN(counter)) {
        await setDoc(
          doc(db, 'settings', 'customerCounter'),
          {
            counter,
            year: currentYear,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    } catch (error) {
      console.error('Error updating customer counter:', error);
      // Don't throw - this is not critical
    }
  },

  /**
   * Search customers by query string
   * @param customers Array of customers to search
   * @param searchTerm Search query
   * @returns Filtered customers
   */
  searchCustomers(customers: Customer[], searchTerm: string): Customer[] {
    if (!searchTerm) return customers;

    const term = searchTerm.toLowerCase();
    return customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(term) ||
        customer.customerCode.toLowerCase().includes(term) ||
        (customer.contact || '').toLowerCase().includes(term) ||
        (customer.email || '').toLowerCase().includes(term)
    );
  },
};

