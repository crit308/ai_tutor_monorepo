import React from 'react';
import { QuizQuestion, QuizFeedbackItem } from '@/lib/types';

// --- Explanation View ---
interface ExplanationViewProps {
  text: string;
  onNext: () => void;
}
export function ExplanationView({ text, onNext }: ExplanationViewProps) {
  return (
    <div className="p-4 bg-blue-50 rounded">
      <p>{text}</p>
      <button
        onClick={onNext}
        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Next
      </button>
    </div>
  );
}

// --- Question View ---
interface QuestionViewProps {
  question: QuizQuestion;
  onAnswer: (idx: number) => void;
}
export function QuestionView({ question, onAnswer }: QuestionViewProps) {
  return (
    <div className="p-4 bg-green-50 rounded">
      <p className="font-medium mb-2">{question.question}</p>
      <div className="space-y-2">
        {question.options.map((opt, idx) => (
          <button
            key={idx}
            onClick={() => onAnswer(idx)}
            className="w-full text-left px-4 py-2 bg-white border rounded hover:bg-gray-100"
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Feedback View ---
interface FeedbackViewProps {
  feedback: QuizFeedbackItem;
  onNext: () => void;
}
export function FeedbackView({ feedback, onNext }: FeedbackViewProps) {
  return (
    <div className="p-4 bg-yellow-50 rounded">
      <p className={`font-medium ${feedback.is_correct ? 'text-green-600' : 'text-red-600'}`}>
        {feedback.is_correct ? 'Correct!' : 'Incorrect'}
      </p>
      <p className="mt-2">{feedback.explanation}</p>
      <button
        onClick={onNext}
        className="mt-4 px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
      >
        Next
      </button>
    </div>
  );
}

// --- Message View ---
interface MessageViewProps {
  text: string;
}
export function MessageView({ text }: MessageViewProps) {
  return (
    <div className="p-4 bg-gray-100 rounded">
      <p>{text}</p>
    </div>
  );
} 