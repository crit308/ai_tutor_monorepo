"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import { ReactNode, useEffect } from "react";
import { setAuthToken } from "@/lib/authToken";
import { AuthProvider } from "@/contexts/AuthContext";

function TokenSync() {
  const token = useAuthToken();
  useEffect(() => {
    setAuthToken(token);
  }, [token]);
  return null;
}

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!, {
  verbose: true
});

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
