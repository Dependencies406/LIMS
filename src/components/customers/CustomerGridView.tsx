import React from 'react';
import type { Customer } from '../../types';
import { Card } from '../common/Card';

interface CustomerGridViewProps {
  customers: Customer[];
  onCustomerClick: (customer: Customer) => void;
  onEdit?: (customer: Customer) => void;
}

/**
 * Grid view for customers - Compact grid display
 */
export const CustomerGridView: React.FC<CustomerGridViewProps> = ({ customers, onCustomerClick, onEdit: _onEdit }) => {
  if (customers.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg">
        <p className="text-gray-600">No customers found</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {customers.map((customer) => (
        <Card key={customer.id} onClick={() => onCustomerClick(customer)} hoverable className="p-4">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900 truncate">
              {customer.customerCode}
            </h3>
            <p className="text-sm text-gray-700 font-medium truncate">{customer.name}</p>
            {customer.contact && (
              <p className="text-xs text-gray-600 truncate">{customer.contact}</p>
            )}
            {customer.email && (
              <p className="text-xs text-gray-500 truncate">{customer.email}</p>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
};

