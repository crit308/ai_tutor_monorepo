import { query } from "./_generated/server";

// Example query function
export const hello = query({
  args: {},
  handler: async (ctx) => {
    return "Hello from Convex!";
  },
}); 