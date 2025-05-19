import React, { useState } from 'react';
import type { QuestionResponse } from '@/lib/types';
import { useSessionStore } from '@/store/sessionStore';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

interface QuestionViewProps {
  content: QuestionResponse;
  onAnswer?: (selectedIndex: number) => void;
}

export default function QuestionView({ content, onAnswer }: QuestionViewProps) {
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);
  const sendInteraction = useSessionStore((state) => state.sendInteraction);
  const loadingState = useSessionStore((state) => state.loadingState);

  const question = content.question_data;

  if (!question) {
    return <div className="p-4 text-red-500">Error: Question data is missing.</div>;
  }

  const handleSubmit = () => {
    if (selectedOptionIndex === null) {
      alert('Please select an answer.');
      return;
    }
    if (onAnswer) {
      onAnswer(selectedOptionIndex);
    } else {
      sendInteraction('answer', { answer_index: selectedOptionIndex });
    }
  };

  const handleSelectionChange = (value: string) => {
    setSelectedOptionIndex(parseInt(value, 10));
  };

  return (
    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md shadow-sm space-y-4">
      {content.topic && (
         <h3 className="text-lg font-semibold text-yellow-800 mb-2">Topic: {content.topic}</h3>
      )}
       {content.context_summary && (
         <p className="text-sm text-gray-600 mb-3 italic">Context: {content.context_summary}</p>
      )}
      <p className="text-base font-medium text-gray-900">{question.question}</p>

      <RadioGroup
        value={selectedOptionIndex !== null ? String(selectedOptionIndex) : undefined}
        onValueChange={handleSelectionChange}
        className="space-y-2"
      >
        {question.options.map((option, index) => (
          <div key={index} className="flex items-center space-x-2 p-2 hover:bg-yellow-100 rounded-md">
            <RadioGroupItem value={String(index)} id={`option-${index}`} />
            <Label htmlFor={`option-${index}`} className="flex-1 cursor-pointer text-sm">
              {option}
            </Label>
          </div>
        ))}
      </RadioGroup>

      <div className="pt-4 flex justify-end">
        <Button
          onClick={handleSubmit}
          disabled={selectedOptionIndex === null || loadingState === 'interacting'}
        >
          {loadingState === 'interacting' ? 'Submitting...' : 'Submit Answer'}
        </Button>
      </div>
    </div>
  );
} 