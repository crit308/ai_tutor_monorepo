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
    filePath: string,
    userId: string,
    folderId: string,
    existingVectorStoreId?: string,
  ): Promise<UploadedFile> {
    this.vectorStoreId = existingVectorStoreId ?? this.vectorStoreId;
    const filename = path.basename(filePath);
    const storagePath = `${userId}/${folderId}/${filename}`;

    const fileResp = await this.client.files.create({
      file: fs.createReadStream(filePath),
      purpose: 'assistants',
    });
    const fileId = fileResp.id;

    if (!this.vectorStoreId) {
      const vs = await this.client.vectorStores.create({
        name: `AI Tutor Vector Store - ${filename}`,
      });
      this.vectorStoreId = vs.id;
    }

    await this.client.vectorStores.files.create(
      this.vectorStoreId as string,
      { file_id: fileId }
    );

    await this.pollFileProcessing(fileId);

    const uploaded: UploadedFile = {
      supabasePath: storagePath,
      fileId,
      filename,
      vectorStoreId: this.vectorStoreId,
    };
    this.uploadedFiles.push(uploaded);
    return uploaded;
  }

  private async pollFileProcessing(fileId: string, timeout = 120000, interval = 2000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const statusResp = await this.client.vectorStores.files.retrieve(
        this.vectorStoreId as string,
        fileId
      );
      const status = statusResp.status;
      if (status === 'completed') return;
      if (['failed', 'cancelled', 'expired'].includes(status)) {
        throw new Error(`OpenAI file processing ${status} for ${fileId}`);
      }
      await new Promise((r) => setTimeout(r, interval));
    }
    throw new Error(`File processing timed out for ${fileId} after ${timeout}ms`);
  }

  getVectorStoreId() {
    return this.vectorStoreId;
  }

  getUploadedFiles() {
    return this.uploadedFiles;
  }
}
