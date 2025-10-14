import React from 'react';
import type { Customer } from '../../types';

interface CustomerListViewProps {
  customers: Customer[];
  onCustomerClick: (customer: Customer) => void;
  onEdit?: (customer: Customer) => void;
}

/**
 * List view for customers - Compact table-like display
 */
export const CustomerListView: React.FC<CustomerListViewProps> = ({ customers, onCustomerClick, onEdit: _onEdit }) => {
  if (customers.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg">
        <p className="text-gray-600">No customers found</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Code
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Contact
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Email
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Phone
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Created
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {customers.map((customer) => (
            <tr
              key={customer.id}
              onClick={() => onCustomerClick(customer)}
              className="hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {customer.customerCode}
              </td>
              <td className="px-6 py-4 text-sm text-gray-900">{customer.name}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{customer.contact || '-'}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{customer.email || '-'}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{customer.phone || '-'}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {new Date(customer.createdAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

