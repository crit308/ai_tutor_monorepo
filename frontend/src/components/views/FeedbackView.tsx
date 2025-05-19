import React from 'react';
import type { QuizFeedbackItem } from '@/lib/types';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid'; // Assuming heroicons is installed
import { Button } from '@/components/ui/button'; // Import Button

interface FeedbackViewProps {
  feedback: QuizFeedbackItem; // Single feedback item
  onNext: () => void;
}

export default function FeedbackView({ feedback, onNext }: FeedbackViewProps) {
  const isCorrect = feedback.is_correct;

  return (
    <div className={`p-6 border rounded-lg shadow-sm space-y-4 ${isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          {isCorrect ? (
            <CheckCircleIcon className="h-6 w-6 text-green-500" aria-hidden="true" />
          ) : (
            <XCircleIcon className="h-6 w-6 text-red-500" aria-hidden="true" />
          )}
        </div>
        <div className="flex-1 space-y-2">
          <p className="text-base font-medium text-gray-800">
            Question: {feedback.question_text}
          </p>
          <p className={`text-sm ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
            Your answer: "{feedback.user_selected_option}" {isCorrect ? <span className="font-semibold">(Correct)</span> : <span className="font-semibold">(Incorrect)</span>}
          </p>
          {!isCorrect && (
            <p className="text-sm text-green-700">
              Correct answer: "{feedback.correct_option}"
            </p>
          )}
          {feedback.explanation && (
            <div className="pt-2 prose prose-sm max-w-none">
              <p className="font-semibold text-gray-700">Explanation:</p>
              <p className="text-gray-600 whitespace-pre-wrap">{feedback.explanation}</p>
            </div>
          )}
           {feedback.improvement_suggestion && (
            <div className="pt-2 prose prose-sm max-w-none">
              <p className="font-semibold text-gray-700">Suggestion:</p>
              <p className="text-gray-600 whitespace-pre-wrap">{feedback.improvement_suggestion}</p>
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-end mt-4">
         <Button onClick={onNext}>Continue</Button>
      </div>
    </div>
  );
} 