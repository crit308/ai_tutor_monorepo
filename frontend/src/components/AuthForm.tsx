'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import LoadingSpinner from './LoadingSpinner';

const AuthForm: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { toast } = useToast();
    const [isSignUp, setIsSignUp] = useState(false);

    const handleAuth = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLoading(true);
        try {
            let error;
            if (isSignUp) {
                ({ error } = await supabase.auth.signUp({ email, password }));
                 if (!error) {
                     toast({ title: "Check your email!", description: "Sign up successful. Please check your email for verification."});
                 }
            } else {
                ({ error } = await supabase.auth.signInWithPassword({ email, password }));
                 if (!error) {
                     toast({ title: "Signed In", description: "Successfully logged in."});
                     // AuthProvider listener will handle state update
                 }
            }

            if (error) throw error;
        } catch (error: any) {
            console.error("Auth error:", error);
            toast({ title: "Authentication Error", description: error.error_description || error.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    // Example provider login (e.g., Google)
    const handleOAuthLogin = async (provider: 'google' | 'github') => {
         setLoading(true);
         const { error } = await supabase.auth.signInWithOAuth({
             provider: provider,
             // options: { redirectTo: window.location.origin } // Optional redirect
         });
         if (error) {
            toast({ title: "OAuth Error", description: error.message, variant: "destructive" });
            setLoading(false);
         }
         // Redirect happens automatically, or handled by listener
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
                </CardFooter>
            </form>
        </Card>
    );
};

export default AuthForm; 