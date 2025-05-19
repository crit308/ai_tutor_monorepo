'use client';

import React, { createContext, useState, useEffect, useContext, ReactNode, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Session, User } from '@supabase/supabase-js';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useSessionStore } from '@/store/sessionStore'; // Import zustand store

interface AuthContextType {
    user: User | null;
    session: Session | null;
    loading: boolean;
    signOut: () => Promise<void>;
    // Add signInWithPassword, signUp, etc. if using email/password
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [user, setUserState] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const setStoreUser = useSessionStore((state) => state.setUser); // Get action from store

    useEffect(() => {
        console.log("AuthProvider: useEffect started. Attempting to get session...");
        setLoading(true); // Ensure loading starts true

        const getSession = async () => {
            try {
                const { data: { session }, error } = await supabase.auth.getSession();
                console.log("AuthProvider: getSession completed.", { session, error }); // Log result

                if (error) {
                    console.error("AuthProvider: Error getting session:", error.message);
                    // Optionally: Show a toast or set an error state here
                }
                setSession(session);
                const currentUser = session?.user ?? null;
                setUserState(currentUser);
                setStoreUser(currentUser);
            } catch (catchError: any) {
                console.error("AuthProvider: Exception during getSession:", catchError);
                // Handle unexpected errors during the async call itself
                setSession(null);
                setUserState(null);
                setStoreUser(null);
            } finally {
                console.log("AuthProvider: Setting loading to false.");
                setLoading(false); // Ensure loading is set to false regardless of outcome
            }
        };

        getSession();

        const { data: authListener } = supabase.auth.onAuthStateChange(
            async (_event, session) => {
                console.log("AuthProvider: onAuthStateChange triggered.", { _event, session });
                setSession(session);
                const currentUser = session?.user ?? null;
                setUserState(currentUser);
                setStoreUser(currentUser);
                // Ensure loading is false if the initial getSession finished quickly
                // and the auth state changes immediately after.
                 if (loading) {
                     setLoading(false);
                 }
            }
        );

        return () => {
            console.log("AuthProvider: Unsubscribing auth listener.");
            authListener.subscription?.unsubscribe();
        };
    }, [setStoreUser]); // Add setStoreUser dependency

    /**
     * Memoized sign-out function to ensure a stable reference between renders.
     * This prevents unnecessary re-creations of the surrounding `value` object
     * returned by `useMemo`, allowing React context consumers to avoid
     * superfluous re-renders when auth state hasn't actually changed.
     */
    const signOut = useCallback(async () => {
        console.log("AuthProvider: Signing out...");
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error("AuthProvider: Error signing out:", error);
            // Consider adding user-facing feedback here (e.g., toast notification)
        }
        // State updates are handled by the `onAuthStateChange` listener.
    }, []);

    const value = useMemo(
        () => ({
            user,
            session,
            loading,
            signOut,
            // Add other auth methods here
        }),
        [user, session, loading] // `signOut` is stable due to `useCallback`
    );

    console.log("AuthProvider: Rendering. Loading state:", loading);

    // Render children only after initial auth check is complete
    return (
        <AuthContext.Provider value={value}>
            {/* Show loading spinner ONLY during the initial load */}
            {loading ? <div className="flex h-screen items-center justify-center"><LoadingSpinner message="Loading user data..." /></div> : children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}; 