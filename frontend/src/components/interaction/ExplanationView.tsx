import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from "@/components/ui/button";
import type { ExplanationResponse } from '@/lib/types';

interface ExplanationViewProps {
  content: ExplanationResponse;
  onNext: () => void;
}

export function ExplanationViewComponent({ content, onNext }: ExplanationViewProps) {
  const { explanation_text, explanation_title, topic } = content as any;

  return (
    <div className="p-4 space-y-4 prose dark:prose-invert max-w-none">
      <h2 className="text-xl font-semibold">Explanation</h2>
      <div className="prose prose-blue max-w-none">
        <p className="whitespace-pre-wrap">{explanation_text}</p>
      </div>
      {!content.is_last_segment && (
        <Button onClick={onNext}>Next</Button>
      )}
    </div>
  );
}

export default ExplanationViewComponent; 