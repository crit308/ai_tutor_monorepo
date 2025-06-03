'use client';

import React, { useState } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import LoadingSpinner from './LoadingSpinner';
import { useRouter } from 'next/navigation';

const AuthForm: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { toast } = useToast();
    const [isSignUp, setIsSignUp] = useState(false);
    const { signIn } = useAuthActions();
    const router = useRouter();

    const handleAuth = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLoading(true);

        if (password.length < 8) {
            toast({
                title: "Password too short",
                description: "Password must be at least 8 characters long.",
                variant: "destructive",
            });
            setLoading(false);
            return;
        }

        // Clear any existing auth tokens to prevent URL mismatch issues
        const clearAuthTokens = () => {
            // Clear all possible auth token storage locations
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.includes('convex') || key.includes('auth'))) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => localStorage.removeItem(key));
            
            // Clear sessionStorage as well
            const sessionKeysToRemove = [];
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                if (key && (key.includes('convex') || key.includes('auth'))) {
                    sessionKeysToRemove.push(key);
                }
            }
            sessionKeysToRemove.forEach(key => sessionStorage.removeItem(key));
        };

        // Clear stale tokens before authentication
        clearAuthTokens();

        try {
            if (isSignUp) {
                await signIn('password', { flow: 'signUp', email, password });
                // Immediately sign in with the same credentials so the user can continue.
                await signIn('password', { flow: 'signIn', email, password });
                toast({ title: "Signed Up", description: "Your account was created and you are now signed in."});
                router.refresh();
            } else {
                await signIn('password', { flow: 'signIn', email, password });
                toast({ title: "Signed In", description: "Successfully logged in."});
                router.refresh();
            }
            
            // Debug: Check what token is being used for websocket auth
            setTimeout(async () => {
                // Check all possible token storage locations
                const locations = [
                    localStorage.getItem('convex-auth-token'),
                    sessionStorage.getItem('convex-auth-token'),
                    localStorage.getItem('convex:auth:token'),
                    sessionStorage.getItem('convex:auth:token'),
                    localStorage.getItem('__convexAuthJWT_httpsbenevolentmouse51convexcloud'),
                    localStorage.getItem('__convexAuthJWT_' + process.env.NEXT_PUBLIC_CONVEX_URL?.replace(/[^a-zA-Z0-9]/g, ''))
                ];
                
                console.log('=== DEBUGGING AUTH TOKEN INFORMATION ===');
                
                for (let idx = 0; idx < locations.length; idx++) {
                    const token = locations[idx];
                    if (token) {
                        console.log(`Found token in location ${idx}:`, token);
                        try {
                            const parts = token.split('.');
                            if (parts.length === 3) {
                                const payload = JSON.parse(atob(parts[1]));
                                console.log(`JWT payload for location ${idx}:`, payload);
                                console.log(`Issuer (iss):`, payload.iss);
                                console.log(`Audience (aud):`, payload.aud);
                                console.log(`Subject (sub):`, payload.sub);
                                console.log(`Provider:`, payload.provider || 'not set');
                                console.log(`Exp:`, payload.exp);
                                console.log(`Iat:`, payload.iat);
                            }
                        } catch (e) {
                            console.log(`Could not decode token from location ${idx}:`, e);
                        }
                    } else {
                        console.log(`No token found in location ${idx}`);
                    }
                }
                
                // Check cookies as well
                console.log('=== CHECKING COOKIES ===');
                console.log('All cookies:', document.cookie);
                
                // Check localStorage and sessionStorage completely
                console.log('=== ALL STORAGE ITEMS ===');
                console.log('localStorage items:');
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.includes('auth') || key && key.includes('convex')) {
                        console.log(`  ${key}: ${localStorage.getItem(key)}`);
                    }
                }
                
                console.log('sessionStorage items:');
                for (let i = 0; i < sessionStorage.length; i++) {
                    const key = sessionStorage.key(i);
                    if (key && key.includes('auth') || key && key.includes('convex')) {
                        console.log(`  ${key}: ${sessionStorage.getItem(key)}`);
                    }
                }
                
                // Check environment variables
                console.log('=== ENVIRONMENT ===');
                console.log('NEXT_PUBLIC_CONVEX_URL:', process.env.NEXT_PUBLIC_CONVEX_URL);
                
                // Test backend auth
                console.log('=== TESTING BACKEND AUTH ===');
                console.log('Auth test will be performed via authenticated UI components');
                
                console.log('=== END DEBUGGING INFO ===');
            }, 2000);
        } catch (error: any) {
            console.error("Auth error:", error);
            toast({ title: "Authentication Error", description: error.error_description || error.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    // Example provider login (e.g., Google)
    const handleOAuthLogin = async (provider: 'github' | 'google') => {
         setLoading(true);
         try {
             await signIn('oauth', { provider });
         } catch (error: any) {
             toast({ title: "OAuth Error", description: error.message, variant: "destructive" });
         } finally {
             setLoading(false);
         }
     };

    // Function to manually clear all auth tokens
    const clearAllTokens = () => {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.includes('convex') || key.includes('auth'))) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        
        const sessionKeysToRemove = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && (key.includes('convex') || key.includes('auth'))) {
                sessionKeysToRemove.push(key);
            }
        }
        sessionKeysToRemove.forEach(key => sessionStorage.removeItem(key));
        
        toast({ 
            title: "Tokens Cleared", 
            description: "All authentication tokens have been cleared. Please sign in again." 
        });
        
        // Refresh the page to reset auth state
        router.refresh();
    };

    return (
        <Card className="w-full max-w-sm">
            <CardHeader>
                <CardTitle>{isSignUp ? 'Sign Up' : 'Sign In'}</CardTitle>
                <CardDescription>{isSignUp ? 'Create an account to start learning.' : 'Sign in to access your sessions.'}</CardDescription>
            </CardHeader>
            <form onSubmit={handleAuth}>
                <CardContent className="space-y-4">
                    <div className="space-y-1">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={loading} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="password">Password</Label>
                        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={loading} />
                    </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-4">
                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? <LoadingSpinner size={16} /> : (isSignUp ? 'Sign Up' : 'Sign In')}
                    </Button>
                     {/* Example OAuth Buttons */}
                     {/* <Button type="button" variant="outline" className="w-full" onClick={() => handleOAuthLogin('google')} disabled={loading}>Sign In with Google</Button> */}
                    <Button type="button" variant="link" size="sm" onClick={() => setIsSignUp(!isSignUp)} disabled={loading}>
                        {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={clearAllTokens} disabled={loading}>
                        Clear Auth Tokens
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
};

export default AuthForm; 