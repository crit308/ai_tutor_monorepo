"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { useAuthToken } from "@convex-dev/auth/react";
import { ReactNode, useEffect } from "react";
import { setAuthToken } from "@/lib/authToken";
import { AuthProvider } from "@/contexts/AuthContext";
import { convex } from "@/lib/convex";

function TokenSync() {
  const token = useAuthToken();
  useEffect(() => {
    setAuthToken(token);
  }, [token]);
  return null;
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthNextjsProvider client={convex}>
      <AuthProvider>
        <TokenSync />
        {children}
      </AuthProvider>
    </ConvexAuthNextjsProvider>
  );
}
