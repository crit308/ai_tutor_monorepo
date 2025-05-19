'use client';

import React, { useState } from 'react';
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import * as api from '@/lib/api';
import { useSessionStore } from '@/store/sessionStore';
import { useToast } from "@/components/ui/use-toast";

interface UserSummaryProps {
  sectionTitle: string;
  topic: string;
}

const UserSummary: React.FC<UserSummaryProps> = ({ sectionTitle, topic }) => {
  const [summary, setSummary] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const sessionId = useSessionStore((state) => state.sessionId);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!summary.trim()) return;
    setSubmitted(true);

    if (sessionId) {
      try {
        await api.logUserSummary(sessionId, {
          section: sectionTitle,
          topic: topic,
          summary: summary,
        });
        toast({ title: "Summary Recorded", description: "Thanks for summarizing!" });
      } catch (error) {
        console.error("Failed to log user summary:", error);
        toast({ title: "Logging Failed", description: "Could not record summary.", variant: "destructive"});
        setSubmitted(false);
      }
    } else {
      toast({ title: "Summary Not Recorded", description: "No active session to log summary."});
    }
  };

  return (
    <Card className="my-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500">
      <CardHeader>
        <CardTitle className="text-base font-semibold">✍️ Time to Summarize!</CardTitle>
        <CardDescription className="text-sm">In your own words, what was the main idea of the concept: <strong>{topic}</strong>?</CardDescription>
      </CardHeader>
      <CardContent>
        <Textarea
          placeholder="Type your summary here..."
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={3}
          disabled={submitted}
        />
      </CardContent>
      <CardFooter>
        <Button onClick={handleSubmit} disabled={!summary.trim() || submitted} size="sm">
          {submitted ? 'Summary Submitted' : 'Submit Summary'}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default UserSummary; 