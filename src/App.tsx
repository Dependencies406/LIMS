import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PdfSettingsProvider } from './contexts/PdfSettingsContext';
import { CompanyInfoProvider } from './contexts/CompanyInfoContext';
import { LoginPage } from './components/LoginPage';
import { Layout } from './components/Layout';
import { JobsPage } from './pages/JobsPage';
import { CustomersPage } from './pages/CustomersPage';
import { SettingsPage } from './pages/SettingsPage';
import { EquipmentDashboardPage } from './pages/equipment/EquipmentDashboardPage';
import { RegistrationWizardPage } from './pages/equipment/RegistrationWizardPage';
import { EquipmentDetailPage } from './pages/equipment/EquipmentDetailPage';
import { UsageLogNewPage } from './pages/equipment/UsageLogNewPage';
import { UsageLogHistoryPage } from './pages/equipment/UsageLogHistoryPage';
import { CalibrationPlanPage } from './pages/equipment/CalibrationPlanPage';
import { RetirementPage } from './pages/equipment/RetirementPage';
import { ToastContainer } from './components/Toast';
import { useToast } from './hooks/useToast';
import './index.css';

// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return currentUser ? <>{children}</> : <Navigate to="/login" replace />;
};

// Admin Protected Route Component
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/jobs" replace />;
  }

  return <>{children}</>;
};

const AppContent: React.FC = () => {
  const { toasts, removeToast } = useToast();

  return (
    <>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected Routes with Layout */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          {/* Default redirect to jobs */}
          <Route index element={<Navigate to="/jobs" replace />} />
          
          {/* Jobs Page */}
          <Route path="jobs" element={<JobsPage />} />
          
          {/* Customers Page */}
          <Route path="customers" element={<CustomersPage />} />

          {/* Equipment Control Module */}
          <Route path="equipment" element={<EquipmentDashboardPage />} />
          <Route path="equipment/new" element={<RegistrationWizardPage />} />
          <Route path="equipment/calibration-plan" element={<CalibrationPlanPage />} />
          <Route path="equipment/:id" element={<EquipmentDetailPage />} />
          <Route path="equipment/:id/usage-log/new" element={<UsageLogNewPage />} />
          <Route path="equipment/:id/usage-log" element={<UsageLogHistoryPage />} />
          <Route path="equipment/:id/retire" element={<RetirementPage />} />

          {/* Settings Page (Admin Only) */}
          <Route
            path="settings"
            element={
              <AdminRoute>
                <SettingsPage />
              </AdminRoute>
            }
          />
        </Route>

        {/* Catch all - redirect to jobs */}
        <Route path="*" element={<Navigate to="/jobs" replace />} />
      </Routes>
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PdfSettingsProvider>
          <CompanyInfoProvider>
            <AppContent />
          </CompanyInfoProvider>
        </PdfSettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

