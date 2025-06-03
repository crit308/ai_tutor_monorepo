'use client';

import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useConvexAuth } from 'convex/react';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  
  // Debug logging
  useEffect(() => {
    console.log('=== AUTH CONTEXT DEBUG ===');
    console.log('isAuthenticated:', isAuthenticated);
    console.log('isLoading:', isLoading);
  }, [isAuthenticated, isLoading]);
  
  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
