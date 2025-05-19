'use client';

import React, { useState } from 'react';
import { QuizQuestion } from '@/lib/types';
import * as api from '@/lib/api';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, XCircle, Lightbulb } from 'lucide-react';
import { useSessionStore } from '@/store/sessionStore';

interface MiniQuizProps {
  question: QuizQuestion;
}

const MiniQuiz: React.FC<MiniQuizProps> = ({ question }) => {
  const [selectedValue, setSelectedValue] = useState<string | undefined>(undefined);
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const sessionId = useSessionStore((state) => state.sessionId);

  const handleSubmit = () => {
    if (selectedValue === undefined) return;

    const selectedIndex = parseInt(selectedValue, 10);
    const correct = selectedIndex === question.correct_answer_index;
    setIsCorrect(correct);
    setSubmitted(true);

    // Optional: Log the attempt to the backend
    if (sessionId) {
        api.logMiniQuizAttempt(sessionId, {
            question: question.question,
            selectedOption: question.options[selectedIndex],
            correctOption: question.options[question.correct_answer_index],
            isCorrect: correct,
            relatedSection: question.related_section,
            topic: question.related_section, // Assuming topic is related section for now
        }).catch(err => console.error("Failed to log mini-quiz attempt:", err));
    }
  };

  const selectedIndex = selectedValue !== undefined ? parseInt(selectedValue, 10) : -1;

  return (
    <Card className="my-4 bg-secondary/50 border-l-4 border-primary">
      <CardHeader>
        <CardTitle className="text-base font-semibold">🧠 Quick Check!</CardTitle>
        <CardDescription className="text-sm">{question.question}</CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={selectedValue}
          onValueChange={setSelectedValue}
          disabled={submitted}
        >
          {question.options.map((option, index) => (
            <div key={index} className="flex items-center space-x-2 my-2">
              <RadioGroupItem value={index.toString()} id={`mini-q-${question.question.substring(0, 10)}-${index}`} />
              <Label htmlFor={`mini-q-${question.question.substring(0, 10)}-${index}`}>{option}</Label>
            </div>
          ))}
        </RadioGroup>
      </CardContent>
      <CardFooter className="flex flex-col items-start space-y-2">
        {!submitted ? (
          <Button onClick={handleSubmit} disabled={selectedValue === undefined} size="sm">
            Check Answer
          </Button>
        ) : (
          <Alert variant={isCorrect ? "default" : "destructive"} className={isCorrect ? "border-green-500" : "border-red-500"}>
            {isCorrect ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            <AlertTitle>{isCorrect ? 'Correct!' : 'Incorrect'}</AlertTitle>
            <AlertDescription className="text-xs">
              {isCorrect ? question.explanation :
                <>
                  The correct answer was: <strong>{question.options[question.correct_answer_index]}</strong>.
                  <br /> <Lightbulb className="inline h-3 w-3 mr-1"/> {question.explanation}
                </>
               }
            </AlertDescription>
          </Alert>
        )}
      </CardFooter>
    </Card>
  );
};

export default MiniQuiz; 