import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { query } from "./_generated/server";
import { v } from "convex/values";

// This is the SINGLE SOURCE OF TRUTH for convexAuth initialization.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({ id: "password" }),
  ],
});

// Debug query to test auth
export const debugAuth = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    console.log("=== DEBUG AUTH QUERY CALLED ===");
    try {
      const userId = await auth.getUserId(ctx);
      console.log("Auth getUserId result:", userId);
      
      return {
        userId,
        isAuthenticated: !!userId,
        timestamp: Date.now()
      };
    } catch (error) {
      console.log("Debug auth error:", error);
      return {
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      };
    }
  }
});

// Re-export other authentication functionality (config constants, middleware, ws utils)
// from the auth subdirectory.
// Temporarily commented out to debug auth issues
// export * from './auth/index'; 