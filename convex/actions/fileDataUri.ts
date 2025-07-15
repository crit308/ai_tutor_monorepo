'use node';
import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { getOpenAIClient } from "../openaiClient";

// Convert an OpenAI Files API file (image/png) into a base64 data URI string
export const getFileDataUri = internalAction({
  args: {
    fileId: v.string(),
  },
  returns: v.string(),
  handler: async (_ctx, { fileId }) => {
    const openai = getOpenAIClient();
    const resp = await openai.files.content(fileId);
    const buffer = Buffer.from(await resp.arrayBuffer());
    return `data:image/png;base64,${buffer.toString('base64')}`;
  },
}); 