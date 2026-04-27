import React, { useState, useEffect } from 'react';
import type { Customer } from '../types';
import { db, collection, onSnapshot, query, orderBy } from '../services/firebase';
import { firestoreToDate } from '../utils/dateUtils';
import { CustomerModal } from '../components/CustomerModal';
import { useToast } from '../hooks/useToast';
import { ViewToggle } from '../components/common/ViewToggle';
import { useViewPreference } from '../hooks/useViewPreference';
import { CustomerListView } from '../components/customers/CustomerListView';
import { CustomerCardView } from '../components/customers/CustomerCardView';
import { CustomerGridView } from '../components/customers/CustomerGridView';
import { exportService } from '../services/exportService';

export const CustomersPage: React.FC = () => {
  const { success, error: showError } = useToast();
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  
  // View preferences with localStorage persistence
  const [customersView, setCustomersView] = useViewPreference('lims-customers-view', 'card');

  // Load customers from Firebase
  useEffect(() => {
    const q = query(collection(db, 'customers'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const customersData = snapshot.docs.map(doc => ({
        id: doc.id,
        customerCode: doc.id,
        ...doc.data(),
        createdAt: firestoreToDate(doc.data().createdAt),
        updatedAt: firestoreToDate(doc.data().updatedAt),
      })) as Customer[];
      setCustomers(customersData);
      setLoading(false);
    }, (err) => {
      console.error('Error loading customers:', err);
      showError('Failed to load customers');
      setLoading(false);
    });

    return unsubscribe;
  }, [showError]);

  const handleCreateCustomer = () => {
    setSelectedCustomer(null);
    setShowCustomerModal(true);
  };

  const handleEditCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setShowCustomerModal(true);
  };

  const handleExportCustomers = () => {
    try {
      exportService.exportCustomersToCSV(filteredCustomers);
      success('Customers exported to CSV successfully');
    } catch (err) {
      showError('Failed to export customers');
    }
  };

  // Filter customers
  const filteredCustomers = customers.filter(customer => {
    return (
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.customerCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (customer.contact || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="flex flex-wrap gap-4 flex-1">
            {/* Animated Search Box */}
            <div className="relative">
              {!isSearchExpanded ? (
                <button
                  onClick={() => setIsSearchExpanded(true)}
                  className="flex items-center justify-center w-10 h-10 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-all duration-200 hover:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  title="Search customers..."
                >
                  <svg
                    className="w-5 h-5 text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </button>
              ) : (
                <div className="flex items-center space-x-2 animate-in slide-in-from-left-2 duration-200">
                  <input
                    type="text"
                    placeholder="Search customers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="input max-w-md transition-all duration-200"
                    autoFocus
                    onBlur={() => {
                      if (!searchTerm.trim()) {
                        setIsSearchExpanded(false);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setSearchTerm('');
                        setIsSearchExpanded(false);
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setIsSearchExpanded(false);
                    }}
                    className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-all duration-200 hover:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    title="Clear search"
                  >
                    <svg
                      className="w-4 h-4 text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* View Toggle */}
            <ViewToggle
              currentView={customersView}
              onViewChange={setCustomersView}
            />
          </div>

          <div className="flex gap-2">
            {/* Export Button */}
            <button
              onClick={handleExportCustomers}
              className="btn btn-secondary whitespace-nowrap"
            >
              📥 Export
            </button>

            {/* Create Customer Button */}
            <button onClick={handleCreateCustomer} className="btn btn-primary whitespace-nowrap">
              + Create Customer
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="card p-4">
            <div className="text-sm text-gray-600">Total Customers</div>
            <div className="text-2xl font-bold text-gray-900">{customers.length}</div>
          </div>
          <div className="card p-4">
            <div className="text-sm text-gray-600">Active Customers</div>
            <div className="text-2xl font-bold text-green-600">
              {customers.filter(c => c.isActive !== false).length}
            </div>
          </div>
          <div className="card p-4">
            <div className="text-sm text-gray-600">New This Month</div>
            <div className="text-2xl font-bold text-blue-600">
              {customers.filter(c => {
                const monthAgo = new Date();
                monthAgo.setMonth(monthAgo.getMonth() - 1);
                return c.createdAt >= monthAgo;
              }).length}
            </div>
          </div>
        </div>

        {/* Customers List */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-gray-500">Loading customers...</div>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-gray-500">No customers found</p>
          </div>
        ) : (
          <>
            {customersView === 'list' && (
              <CustomerListView
                customers={filteredCustomers}
                onCustomerClick={handleEditCustomer}
                onEdit={handleEditCustomer}
              />
            )}
            {customersView === 'card' && (
              <CustomerCardView
                customers={filteredCustomers}
                onCustomerClick={handleEditCustomer}
                onEdit={handleEditCustomer}
              />
            )}
            {customersView === 'grid' && (
              <CustomerGridView
                customers={filteredCustomers}
                onCustomerClick={handleEditCustomer}
                onEdit={handleEditCustomer}
              />
            )}
          </>
        )}

        {/* Customer Modal */}
        {showCustomerModal && (
          <CustomerModal
            customer={selectedCustomer}
            onClose={() => setShowCustomerModal(false)}
            onSuccess={() => {
              setShowCustomerModal(false);
              success(selectedCustomer ? 'Customer updated successfully' : 'Customer created successfully');
            }}
          />
        )}
      </div>
    </div>
  );
};

