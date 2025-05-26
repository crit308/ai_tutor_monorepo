"use node";

import fs from 'fs';
import path from 'path';
import { OpenAI } from 'openai';

export interface UploadedFile {
  supabasePath: string;
  fileId?: string;
  filename: string;
  vectorStoreId?: string;
}

export class FileUploadManager {
  private client: OpenAI;
  public vectorStoreId?: string;
  private uploadedFiles: UploadedFile[] = [];

  constructor(apiKey: string, vectorStoreId?: string) {
    this.client = new OpenAI({ apiKey });
    this.vectorStoreId = vectorStoreId;
  }

  async uploadAndProcessFile(
    fileContent: Buffer,
    filename: string,
    userId: string,
    folderId: string,
    existingVectorStoreId?: string,
  ): Promise<UploadedFile> {
    this.vectorStoreId = existingVectorStoreId ?? this.vectorStoreId;

    console.log(`[FileUploadManager] Processing ${filename} for OpenAI upload.`);

    let fileId: string;
    try {
      console.log(`[FileUploadManager] Uploading ${filename} to OpenAI files endpoint...`);
      // Create a File-like object that the OpenAI SDK expects
      const fileForOpenAI = new File([fileContent], filename, {
        type: 'application/octet-stream'
      });

      const response = await this.client.files.create({ 
        file: fileForOpenAI, 
        purpose: "assistants" 
      });
      fileId = response.id;
      console.log(`[FileUploadManager] ${filename} uploaded to OpenAI. File ID: ${fileId}`);
    } catch (e) {
      console.error(`[FileUploadManager] Failed to upload ${filename} to OpenAI files API:`, e);
      throw new Error(`Failed to upload ${filename} to OpenAI: ${(e as Error).message}`);
    }

    if (!this.vectorStoreId) {
      try {
        console.log(`[FileUploadManager] No vector store ID. Creating new one for ${filename}...`);
        const vs_response = await this.client.vectorStores.create({
          name: `AI Tutor - ${folderId || userId} - ${Date.now()}`,
        });
        this.vectorStoreId = vs_response.id;
        console.log(`[FileUploadManager] Created vector store: ${this.vectorStoreId}`);
      } catch (e) {
        console.error(`[FileUploadManager] Failed to create vector store:`, e);
        throw new Error(`Failed to create vector store: ${(e as Error).message}`);
      }
    }

    try {
      console.log(`[FileUploadManager] Adding file ${fileId} to vector store ${this.vectorStoreId}...`);
      await this.client.vectorStores.files.create(
        this.vectorStoreId as string,
        { file_id: fileId }
      );
      console.log(`[FileUploadManager] File ${fileId} added to vector store ${this.vectorStoreId}.`);
    } catch (e) {
      console.error(`[FileUploadManager] Failed to add file ${fileId} to vector store ${this.vectorStoreId}:`, e);
      throw new Error(`Failed to add file to vector store: ${(e as Error).message}`);
    }

    try {
      console.log(`[FileUploadManager] Polling processing status for file ${fileId} in vector store ${this.vectorStoreId}...`);
      await this.pollFileProcessing(fileId);
      console.log(`[FileUploadManager] File ${fileId} processing completed.`);
    } catch (e) {
      throw e;
    }

    const uploaded: UploadedFile = {
      supabasePath: `openai_file://${fileId}`,
      fileId: fileId,
      filename: filename,
      vectorStoreId: this.vectorStoreId,
    };
    this.uploadedFiles.push(uploaded);
    return uploaded;
  }

  private async pollFileProcessing(fileId: string, timeout = 120000, interval = 5000) {
    const start = Date.now();
    console.log(`[FileUploadManager] Starting to poll file ${fileId} in VS ${this.vectorStoreId}. Timeout: ${timeout/1000}s.`);
    while (Date.now() - start < timeout) {
      try {
        const retrieved = await this.client.vectorStores.files.retrieve(
          this.vectorStoreId!,
          fileId
        );
        const status = retrieved.status;
        console.log(`[FileUploadManager] File ${fileId} status: ${status}. Last error: ${retrieved.last_error?.message || 'None'}`);

        if (status === "completed") {
          return;
        }
        if (status === "failed" || status === "cancelled") {
          const errorMsg = retrieved.last_error?.message || `OpenAI file processing ${status}`;
          console.error(`[FileUploadManager] OpenAI file processing ${status} for ${fileId}: ${errorMsg}`);
          throw new Error(errorMsg);
        }
      } catch (apiError: any) {
        console.warn(`[FileUploadManager] API error while polling file ${fileId} (attempt ${Math.floor((Date.now() - start)/interval)}):`, apiError.message);
        if (apiError.status === 404 && (Date.now() - start < 30000)) {
          console.log(`[FileUploadManager] File ${fileId} not found yet, retrying...`);
        } else if (apiError.message && apiError.message.includes("rate_limit_exceeded")) {
          console.warn(`[FileUploadManager] Rate limit hit while polling. Increasing interval.`);
          await new Promise((r) => setTimeout(r, interval * 2));
          continue;
        } else {
          console.error(`[FileUploadManager] Unrecoverable API error polling file ${fileId}:`, apiError);
          throw new Error(`API error polling file ${fileId}: ${apiError.message}`);
        }
      }
      await new Promise((r) => setTimeout(r, interval));
    }
    console.error(`[FileUploadManager] File processing timed out for ${fileId} after ${timeout / 1000}s`);
    throw new Error(`File processing timed out for ${fileId} after ${timeout / 1000}s`);
  }

  getVectorStoreId(): string | undefined {
    return this.vectorStoreId;
  }

  getUploadedFiles(): UploadedFile[] {
    return this.uploadedFiles;
  }
}
