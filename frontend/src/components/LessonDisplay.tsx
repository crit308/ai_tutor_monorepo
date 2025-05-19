/*
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { LessonContent, SectionContent as SectionContentType, ExplanationContent as ExplanationContentType } from '@/lib/types';
import MiniQuiz from './MiniQuiz'; // Assuming you have this component

interface LessonDisplayProps {
  lessonContent: LessonContent;
}

const LessonDisplay: React.FC<LessonDisplayProps> = ({ lessonContent }) => {

  // Helper function to render an explanation section
  const renderExplanation = (explanation: ExplanationContentType, sectionTitle: string) => (
    <AccordionItem key={explanation.topic} value={`${sectionTitle}-${explanation.topic}`}>
      <AccordionTrigger>{explanation.topic}</AccordionTrigger>
      <AccordionContent>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{explanation.explanation}</ReactMarkdown>
        {explanation.examples && explanation.examples.length > 0 && (
          <div className="mt-2">
            <h4 className="font-semibold">Examples:</h4>
            <ul className="list-disc pl-5 space-y-1">
              {explanation.examples.map((ex: any, i: number) => <li key={i}>{ex}</li>)}
            </ul>
          </div>
        )}
        {explanation.mini_quiz && explanation.mini_quiz.map((mq: any, index: number) => (
          <MiniQuiz key={index} quizData={mq} />
        ))}
      </AccordionContent>
    </AccordionItem>
  );

  // Helper function to render a section
  const renderSection = (section: SectionContentType) => (
    <Card key={section.title} className="mb-6">
      <CardHeader>
        <CardTitle>{section.title}</CardTitle>
      </CardHeader>
      <CardContent>
        {section.introduction && <p className="mb-4">{section.introduction}</p>}

        {section.explanations && section.explanations.length > 0 && (
          <Accordion type="single" collapsible className="w-full mb-4">
            <h3 className="text-lg font-semibold mb-2">Concepts & Explanations</h3>
            {section.explanations?.map((exp: any) => renderExplanation(exp, section.title))}
          </Accordion>
        )}

        {section.exercises && section.exercises.length > 0 && (
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-2">Exercises</h3>
            <ul className="list-decimal pl-5 space-y-2">
              {section.exercises.map((ex: any, i: number) => (
                <li key={i}>
                  <p>{ex.question} <span className="text-xs text-muted-foreground">({ex.difficulty_level})</span></p>
                  {/* TODO: Add way to reveal answer/explanation later */}
                </li>
              ))}
            </ul>
          </div>
        )}

        {section.summary && (
          <>
            <h3 className="text-lg font-semibold mb-2">Section Summary</h3>
            <p>{section.summary}</p>
          </>
        )}
      </CardContent>
    </Card>
  );

  if (!lessonContent) {
    return <div>Loading lesson content...</div>; // Or some placeholder
  }

  return (
    <div className="prose dark:prose-invert max-w-none">
      <h1 className="text-3xl font-bold mb-4">{lessonContent.title}</h1>

      {lessonContent.introduction && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Introduction</h2>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{lessonContent.introduction}</ReactMarkdown>
        </div>
      )}

      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-2">Sections</h2>
        {lessonContent.sections?.map(renderSection)}
      </div>

      {lessonContent.conclusion && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Conclusion</h2>
          <p className="mb-2">{lessonContent.conclusion}</p>
          {lessonContent.next_steps && lessonContent.next_steps.length > 0 && (
            <>
              <h3 className="font-semibold">Next Steps:</h3>
              <ul className="list-disc pl-5 space-y-1">
                {lessonContent.next_steps.map((step: any, i: number) => <li key={i}>{step}</li>)}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default LessonDisplay;
*/

// Placeholder export to avoid breaking imports
const LessonDisplay = () => null;
export default LessonDisplay; 