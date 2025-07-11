import React from 'react';
import type { ChatMessage } from '@/hooks/useTutorStream';

export interface MessageViewProps {
  content: ChatMessage;
}

export default function MessageView({ content }: MessageViewProps) {
  return (
    <div className="p-4 bg-blue-50 border border-blue-200 rounded-md shadow-sm space-y-3">
      {content.images && content.images.map((img, i) => {
        const src = img.file_id ? `/api/convex-file/${img.file_id}` : img.url || '';
        if (!src) return null;
        return (
          <img key={i} src={src} alt="screenshot" className="max-w-full rounded" />
        );
      })}
      {content.content && (
        <p className="text-gray-800 whitespace-pre-wrap">{content.content}</p>
      )}
    </div>
  );
} 