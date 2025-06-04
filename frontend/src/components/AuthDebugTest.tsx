'use client';

import React, { useState } from 'react';
import { useConvex } from 'convex/react';
import { useConvexAuth } from 'convex/react';
import { api } from 'convex_generated/api';
import { Button } from './ui/button';

export const AuthDebugTest: React.FC = () => {
    const { isAuthenticated, isLoading } = useConvexAuth();
    const convex = useConvex();
    const [debugResult, setDebugResult] = useState<any>(null);
    const [testing, setTesting] = useState(false);
    
    const testAuth = async () => {
        setTesting(true);
        try {
            console.log('=== AUTH DEBUG TEST COMPONENT ===');
            console.log('isAuthenticated:', isAuthenticated);
            console.log('isLoading:', isLoading);
            
            if (isAuthenticated) {
                const result = await convex.query(api.auth.debugAuth, {});
                console.log('debugResult:', result);
                setDebugResult(result);
            } else {
                setDebugResult({ error: 'Not authenticated' });
            }
        } catch (error) {
            console.error('Auth debug test failed:', error);
            setDebugResult({ error: error instanceof Error ? error.message : 'Unknown error' });
        } finally {
            setTesting(false);
        }
    };
    
    if (isLoading) {
        return <div>Loading authentication...</div>;
    }
    
    return (
        <div className="p-4 border rounded-md bg-gray-50">
            <h3 className="font-semibold">Auth Debug Test</h3>
            <p>Authenticated: {isAuthenticated ? 'Yes' : 'No'}</p>
            <p>Loading: {isLoading ? 'Yes' : 'No'}</p>
            <Button 
                onClick={testAuth} 
                disabled={testing || isLoading}
                size="sm"
                variant="outline"
            >
                {testing ? 'Testing...' : 'Test Backend Auth'}
            </Button>
            {debugResult && (
                <div className="mt-2 p-2 bg-white rounded text-xs">
                    <strong>Backend Result:</strong> {JSON.stringify(debugResult, null, 2)}
                </div>
            )}
        </div>
    );
}; 