import React from 'react';
import type { MessageResponse } from '@/lib/types';

export interface MessageViewProps {
  content: MessageResponse;
}

export default function MessageView({ content }: MessageViewProps) {
  // Simple display of the message text
  return (
    <div className="p-4 bg-blue-50 border border-blue-200 rounded-md shadow-sm">
      <p className="text-gray-800 whitespace-pre-wrap">{content.text}</p>
    </div>
  );
} 