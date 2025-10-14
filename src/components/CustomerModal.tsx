import React, { useState, useEffect } from 'react';
import type { Customer } from '../types';
import { db, doc, setDoc, updateDoc, serverTimestamp, deleteDoc, getDoc } from '../services/firebase';

interface CustomerModalProps {
  customer: Customer | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const CustomerModal: React.FC<CustomerModalProps> = ({ customer, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [form, setForm] = useState({
    customerCode: '',
    name: '',
    contact: '',
    address: '',
    email: '',
    phone: ''
  });

  useEffect(() => {
    if (customer) {
      setForm({
        customerCode: customer.customerCode,
        name: customer.name,
        contact: customer.contact,
        address: customer.address,
        email: customer.email || '',
        phone: customer.phone || ''
      });
    } else {
      // Generate Customer Code with CM-YYXXX format
      generateCustomerCode();
    }
  }, [customer]);

  const generateCustomerCode = async () => {
    try {
      // Get current year (last 2 digits)
      const currentYear = new Date().getFullYear().toString().slice(-2);
      
      // Get the customer counter from settings
      const settingsDoc = await getDoc(doc(db, 'settings', 'customerCounter'));
      let counter = 1;
      
      if (settingsDoc.exists()) {
        counter = (settingsDoc.data().counter || 0) + 1;
      }
      
      // Format: CM-YYXXX (e.g., CM-25008)
      const customerCode = `CM-${currentYear}${counter.toString().padStart(3, '0')}`;
      setForm(prev => ({ ...prev, customerCode }));
    } catch (err) {
      console.error('Error generating customer code:', err);
      // Fallback to random code
      const randomStr = Math.random().toString(36).substring(2, 5).toUpperCase();
      const currentYear = new Date().getFullYear().toString().slice(-2);
      setForm(prev => ({ ...prev, customerCode: `CM-${currentYear}${randomStr}` }));
    }
  };

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!form.customerCode || !form.name) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);

    try {
      const customerData = {
        name: form.name,
        contact: form.contact,
        address: form.address,
        email: form.email,
        phone: form.phone,
        updatedAt: serverTimestamp(),
        ...(customer ? {} : { createdAt: serverTimestamp() })
      };

      if (customer) {
        // Update existing customer (use customer code as document ID)
        await updateDoc(doc(db, 'customers', customer.customerCode), customerData);
      } else {
        // Create new customer (use customer code as document ID)
        await setDoc(doc(db, 'customers', form.customerCode), customerData);
        
        // Update the counter
        const currentYear = new Date().getFullYear().toString().slice(-2);
        const counterPart = form.customerCode.slice(-3);
        const counter = parseInt(counterPart);
        
        if (!isNaN(counter)) {
          await setDoc(doc(db, 'settings', 'customerCounter'), {
            counter,
            year: currentYear,
            updatedAt: serverTimestamp()
          }, { merge: true });
        }
      }

      // Show success message
      setSuccessMessage(customer ? 'Changes saved!' : 'Customer created successfully!');
      setShowSuccess(true);
      
      // Close modal after showing success for 1 second
      setTimeout(() => {
        onSuccess();
      }, 1000);
    } catch (err) {
      console.error('Error saving customer:', err);
      setError('Failed to save customer. Please try again.');
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!customer) return;
    
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'customers', customer.customerCode));
      
      // Show success message
      setSuccessMessage('Customer deleted successfully!');
      setShowSuccess(true);
      
      // Close modal after showing success for 1 second
      setTimeout(() => {
        onSuccess();
      }, 1000);
    } catch (err) {
      console.error('Error deleting customer:', err);
      setError('Failed to delete customer. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-content max-w-2xl" onClick={e => e.stopPropagation()}>
        {/* Loading/Success Overlay */}
        {(loading || showSuccess) && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 rounded-lg">
            <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4">
              <div className="text-center">
                {showSuccess ? (
                  <>
                    {/* Success Checkmark */}
                    <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                      <svg className="h-10 w-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-green-600 mb-2">
                      {successMessage}
                    </h3>
                    <p className="text-gray-600 text-sm">Redirecting...</p>
                  </>
                ) : (
                  <>
                    {/* Loading Spinner */}
                    <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary-600 mx-auto mb-4"></div>
                    <h3 className="text-xl font-semibold text-gray-800 mb-2">
                      {showDeleteConfirm ? 'Deleting customer...' : customer ? 'Saving changes...' : 'Creating customer...'}
                    </h3>
                    <p className="text-gray-600 text-sm">Please wait</p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">
            {customer ? 'Edit Customer' : 'Create New Customer'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Customer Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.customerCode}
                onChange={(e) => handleChange('customerCode', e.target.value)}
                className="input"
                required
                disabled={!!customer}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
                className="input"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Contact Person
            </label>
            <input
              type="text"
              value={form.contact}
              onChange={(e) => handleChange('contact', e.target.value)}
              className="input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Address
            </label>
            <textarea
              value={form.address}
              onChange={(e) => handleChange('address', e.target.value)}
              className="input"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => handleChange('email', e.target.value)}
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                className="input"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-between items-center pt-4 border-t border-gray-200">
            {customer && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="btn btn-danger"
                disabled={loading}
              >
                Delete
              </button>
            )}
            <div className={`flex space-x-3 ${customer ? '' : 'ml-auto'}`}>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
              >
                {loading ? 'Saving...' : customer ? 'Update Customer' : 'Create Customer'}
              </button>
            </div>
          </div>
        </form>

        {/* Delete Confirmation */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-lg">
            <div className="bg-white rounded-lg p-6 max-w-sm">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Confirm Delete</h3>
              <p className="text-gray-600 mb-4">
                Are you sure you want to delete this customer? This action cannot be undone.
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="btn btn-secondary"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="btn btn-danger"
                  disabled={loading}
                >
                  {loading ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

