import React from 'react';
import type { ExplanationResponse } from '@/lib/types';
import { Button } from '@/components/ui/button';

interface ExplanationViewProps {
  content: ExplanationResponse;
  onNext: () => void;
  showNextButton: boolean;
}

export default function ExplanationView({ content, onNext, showNextButton }: ExplanationViewProps) {
  console.log("ExplanationView received content:", content);
  const { text, topic, references } = content;

  return (
    <div className="p-6 bg-blue-50 border border-blue-200 rounded-lg shadow-sm space-y-4">
      {topic && (
        <h3 className="text-xl font-semibold text-blue-800">Topic: {topic}</h3>
      )}
      <div className="prose prose-blue max-w-none">
         <p className="whitespace-pre-wrap">{text}</p>
      </div>
      {/* TODO: Display references if needed: references */}
      {showNextButton && (
        <div className="flex justify-end mt-4">
          <Button onClick={onNext}>Continue</Button>
        </div>
      )}
    </div>
  );
} 