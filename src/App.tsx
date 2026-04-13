/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HouseProvider, useHouse } from './contexts/HouseContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toaster } from '@/components/ui/sonner';
import Login from './components/Login';
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { user, profile, house, loading } = useHouse();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (!profile || !house) {
    return <Onboarding />;
  }

  return <Dashboard />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <HouseProvider>
        <AppContent />
        <Toaster />
      </HouseProvider>
    </ErrorBoundary>
  );
}
