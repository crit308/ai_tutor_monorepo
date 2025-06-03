'use client';

import React, { useEffect, useState } from 'react';
import { useQuery } from 'convex/react';
import { useConvexAuth } from 'convex/react';
import { api } from 'convex_generated/api';

export const AuthDebugTest: React.FC = () => {
    const { isAuthenticated, isLoading } = useConvexAuth();
    const [hasTestedAuth, setHasTestedAuth] = useState(false);
    
    // Use the authenticated query
    const debugResult = useQuery(api.auth.debugAuth, {});
    
    useEffect(() => {
        if (!isLoading && !hasTestedAuth) {
            console.log('=== AUTH DEBUG TEST COMPONENT ===');
            console.log('isAuthenticated:', isAuthenticated);
            console.log('isLoading:', isLoading);
            console.log('debugResult:', debugResult);
            setHasTestedAuth(true);
        }
    }, [isAuthenticated, isLoading, debugResult, hasTestedAuth]);
    
    if (isLoading) {
        return <div>Testing authentication...</div>;
    }
    
    return (
        <div className="p-4 border rounded-md bg-gray-50">
            <h3 className="font-semibold">Auth Debug Test</h3>
            <p>Authenticated: {isAuthenticated ? 'Yes' : 'No'}</p>
            <p>Loading: {isLoading ? 'Yes' : 'No'}</p>
            <p>Backend Auth Result: {debugResult ? JSON.stringify(debugResult) : 'null'}</p>
        </div>
    );
}; 