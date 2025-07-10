'use node';
import OpenAI from "openai";
import { File } from "node:buffer";

// Singleton OpenAI client for Convex actions
let _openaiClient: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!_openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }
    _openaiClient = new OpenAI({ apiKey });
  }
  return _openaiClient;
}

// Helper function to upload image data to OpenAI Files API
export async function uploadImageToOpenAI(
  imageData: string,
  filename: string = "whiteboard.png"
): Promise<string> {
  const openai = getOpenAIClient();
  // Strip data URI prefix if present
  const base64 = imageData.replace(/^data:image\/[^;]+;base64,/, "");
  const buffer = Buffer.from(base64, "base64");
  // Create a File object (File extends Blob and includes name)
  const file = new File([buffer], filename, { type: "image/png" });
  const uploaded = await openai.files.create({
    file,
    purpose: "vision",
  });
  console.log(`[OpenAI Files] Uploaded file ${uploaded.id} (${uploaded.bytes} bytes)`);
  return uploaded.id;
}

export async function deleteFileFromOpenAI(fileId: string): Promise<boolean> {
  try {
    const openai = getOpenAIClient();
    await openai.files.del(fileId);
    console.log(`[OpenAI Files] Deleted file ${fileId}`);
    return true;
  } catch (err) {
    console.error(`[OpenAI Files] Delete failed for ${fileId}`, err);
    return false;
  }
} 