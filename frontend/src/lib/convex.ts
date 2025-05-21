import { ConvexClient } from "convex/browser";
import { supabase } from "./supabaseClient";

export const convex = new ConvexClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Authenticate Convex requests with the current Supabase session
convex.setAuth(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
});
