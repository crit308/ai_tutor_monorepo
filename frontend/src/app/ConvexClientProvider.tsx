"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { useAuthToken } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { ReactNode, useEffect } from "react";
import { setAuthToken } from "@/lib/authToken";
import { AuthProvider } from "@/contexts/AuthContext";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

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
