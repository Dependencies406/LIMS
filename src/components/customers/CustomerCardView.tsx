import React from 'react';
import type { Customer } from '../../types';
import { Card } from '../common/Card';

interface CustomerCardViewProps {
  customers: Customer[];
  onCustomerClick: (customer: Customer) => void;
  onEdit?: (customer: Customer) => void;
}

/**
 * Card view for customers - Detailed card display (original view)
 */
export const CustomerCardView: React.FC<CustomerCardViewProps> = ({ customers, onCustomerClick, onEdit: _onEdit }) => {
  if (customers.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg">
        <p className="text-gray-600">No customers found</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {customers.map((customer) => (
        <Card key={customer.id} onClick={() => onCustomerClick(customer)} hoverable>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-gray-900">
              {customer.customerCode}
            </h3>
            <p className="text-gray-700 font-medium">{customer.name}</p>
            {customer.contact && (
              <p className="text-sm text-gray-600">
                <span className="font-medium">Contact:</span> {customer.contact}
              </p>
            )}
            {customer.email && (
              <p className="text-sm text-gray-600">
                <span className="font-medium">Email:</span> {customer.email}
              </p>
            )}
            {customer.phone && (
              <p className="text-sm text-gray-600">
                <span className="font-medium">Phone:</span> {customer.phone}
              </p>
            )}
            {customer.address && (
              <p className="text-sm text-gray-600">
                <span className="font-medium">Address:</span> {customer.address}
              </p>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
};

