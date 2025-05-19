'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSessionStore } from '@/store/sessionStore';
import * as api from '@/lib/api';
import { SessionAnalysis } from '@/lib/types';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Check, Zap, AlertTriangle, Target, Lightbulb, BookMarked, Star } from 'lucide-react';
import { Label } from "@/components/ui/label";

// Helper to format score
const formatScore = (score: number) => score ? score.toFixed(1) : 'N/A';

// Helper function to safely get progress value
const getProgressValue = (value: number | null | undefined): number => {
  if (typeof value === 'number' && !isNaN(value) && value >= 0 && value <= 100) {
    return value;
  }
  return 0; // Default to 0 if invalid or null/undefined
};

// Type assertion for Progress component props
type SafeProgressProps = Omit<React.ComponentPropsWithoutRef<typeof Progress>, 'value'> & { value: number };

export default function AnalysisPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = typeof params?.sessionId === 'string' ? params.sessionId : null;

  const { sessionAnalysis, setSessionAnalysis, loadingState, setLoading, error, setError } = useSessionStore(state => ({
    sessionAnalysis: state.sessionAnalysis,
    setSessionAnalysis: state.setSessionAnalysis,
    loadingState: state.loadingState,
    setLoading: state.setLoading,
    error: state.error,
    setError: state.setError,
  }));

  const [localLoading, setLocalLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) {
      setError({ message: 'Invalid session ID.' });
      setLocalLoading(false);
      return;
    }

    const fetchAnalysis = async () => {
      setLocalLoading(true);
      setLoading('loading', 'Fetching session analysis...');
      setError(null);
      try {
        const data = await api.getSessionAnalysis(sessionId);
        if (!data) {
          setLoading('loading', 'Analysis is processing, please wait...');
          await new Promise(resolve => setTimeout(resolve, 5000));
          const retryData = await api.getSessionAnalysis(sessionId);
          if (!retryData) {
            throw new Error("Session analysis timed out or failed.");
          }
          setSessionAnalysis(retryData);
        } else {
          setSessionAnalysis(data);
        }
        setLoading('idle');
      } catch (err: any) {
        console.error("Failed to fetch session analysis:", err);
        const errorMessage = err.response?.data?.detail || err.message || 'Failed to load session analysis.';
        setError({ message: errorMessage });
        setLoading('error', errorMessage);
      } finally {
        setLocalLoading(false);
      }
    };

    // Fetch analysis if not already in store
    if (!sessionAnalysis || sessionAnalysis.session_id !== sessionId) {
      fetchAnalysis();
    } else {
      setLocalLoading(false);
      setLoading('idle');
    }

  }, [sessionId, sessionAnalysis, setSessionAnalysis, setLoading, setError]);

  if (localLoading || loadingState === 'loading') {
    return <LoadingSpinner message={useSessionStore.getState().loadingMessage || 'Loading analysis...'} />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error Loading Analysis</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
        <Button onClick={() => router.push('/')} variant="link" className="mt-2">Go back to start</Button>
      </Alert>
    );
  }

  if (!sessionAnalysis) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Analysis Not Available</AlertTitle>
        <AlertDescription>Session analysis data could not be loaded.</AlertDescription>
        <Button onClick={() => router.push('/')} variant="link" className="mt-2">Go back to start</Button>
      </Alert>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Session Analysis</h1>
      <Card>
        <CardHeader>
          <CardTitle>Overall Session Summary</CardTitle>
          <CardDescription>Session ID: {sessionAnalysis.session_id} | Duration: {Math.round(sessionAnalysis.session_duration_seconds / 60)} mins</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Overall Effectiveness ({formatScore(sessionAnalysis.overall_effectiveness ?? 0)} / 100)</Label>
            <Progress {...{ value: getProgressValue(sessionAnalysis.overall_effectiveness) } as SafeProgressProps} className="w-full" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold text-sm flex items-center mb-1"><Star className="w-4 h-4 mr-2 text-yellow-500"/>Strengths</h4>
              <ul className="list-disc list-inside text-sm space-y-1">
                {sessionAnalysis.strengths?.map((s, i) => <li key={i}>{s}</li>)}
                {(!sessionAnalysis.strengths || sessionAnalysis.strengths.length === 0) && <li className="text-muted-foreground">None identified</li>}
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm flex items-center mb-1"><AlertTriangle className="w-4 h-4 mr-2 text-orange-500"/>Improvement Areas</h4>
              <ul className="list-disc list-inside text-sm space-y-1">
                {sessionAnalysis.improvement_areas?.map((a, i) => <li key={i}>{a}</li>)}
                {(!sessionAnalysis.improvement_areas || sessionAnalysis.improvement_areas.length === 0) && <li className="text-muted-foreground">None identified</li>}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-lg">Component Quality</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span>Lesson Plan:</span> <span>{formatScore(sessionAnalysis.lesson_plan_quality)}/100</span></div>
            <div className="flex justify-between"><span>Teaching Content:</span> <span>{formatScore(sessionAnalysis.content_quality)}/100</span></div>
            <div className="flex justify-between"><span>Quiz Quality:</span> <span>{formatScore(sessionAnalysis.quiz_quality)}/100</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Performance</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span>Student Performance:</span> <span>{formatScore(sessionAnalysis.student_performance)}/100</span></div>
            <div className="flex justify-between"><span>Teaching Effectiveness:</span> <span>{formatScore(sessionAnalysis.teaching_effectiveness)}/100</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center"><Target className="w-5 h-5 mr-2"/>Recommendations</CardTitle></CardHeader>
          <CardContent>
            {sessionAnalysis.recommendations && sessionAnalysis.recommendations.length > 0 ? (
              <ul className="list-disc list-inside space-y-1 text-sm">
                {sessionAnalysis.recommendations.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No specific recommendations.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg flex items-center"><Lightbulb className="w-5 h-5 mr-2"/>Detailed Insights</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {sessionAnalysis.learning_insights && sessionAnalysis.learning_insights.length > 0 && (
            <div>
              <h4 className="font-semibold text-md mb-2">Learning Insights:</h4>
              {sessionAnalysis.learning_insights.map((li, i) => (
                <div key={i} className="text-sm border-l-2 pl-3 mb-2 space-y-0.5">
                  <p><strong>Topic:</strong> {li.topic} ({li.strength ? 'Strength' : 'Improvement Area'})</p>
                  <p><strong>Observation:</strong> {li.observation}</p>
                  <p><strong>Recommendation:</strong> {li.recommendation}</p>
                </div>
              ))}
            </div>
          )}
          {sessionAnalysis.teaching_insights && sessionAnalysis.teaching_insights.length > 0 && (
            <div>
              <h4 className="font-semibold text-md mb-2 pt-3 border-t">Teaching Insights:</h4>
              {sessionAnalysis.teaching_insights.map((ti, i) => (
                <div key={i} className="text-sm border-l-2 pl-3 mb-2 space-y-0.5">
                  <p><strong>Approach:</strong> {ti.approach}</p>
                  <p><strong>Effectiveness:</strong> {ti.effectiveness}</p>
                  <p><strong>Evidence:</strong> {ti.evidence}</p>
                  <p><strong>Suggestion:</strong> {ti.suggestion}</p>
                </div>
              ))}
            </div>
          )}
          {sessionAnalysis.lesson_plan_insights && sessionAnalysis.lesson_plan_insights.length > 0 && (
            <div>
              <h4 className="font-semibold text-md mb-2 pt-3 border-t">Lesson Plan Insights:</h4>
              <ul className="list-disc list-inside text-sm space-y-1">
                {sessionAnalysis.lesson_plan_insights.map((lpi, i) => <li key={i}>{lpi}</li>)}
              </ul>
            </div>
          )}
          {sessionAnalysis.content_insights && sessionAnalysis.content_insights.length > 0 && (
            <div>
              <h4 className="font-semibold text-md mb-2 pt-3 border-t">Content Insights:</h4>
              <ul className="list-disc list-inside text-sm space-y-1">
                {sessionAnalysis.content_insights.map((ci, i) => <li key={i}>{ci}</li>)}
              </ul>
            </div>
          )}
          {sessionAnalysis.quiz_insights && sessionAnalysis.quiz_insights.length > 0 && (
            <div>
              <h4 className="font-semibold text-md mb-2 pt-3 border-t">Quiz Insights:</h4>
              <ul className="list-disc list-inside text-sm space-y-1">
                {sessionAnalysis.quiz_insights.map((qi, i) => <li key={i}>{qi}</li>)}
              </ul>
            </div>
          )}
          {sessionAnalysis.suggested_resources && sessionAnalysis.suggested_resources.length > 0 && (
            <div>
              <h4 className="font-semibold text-md mb-2 pt-3 border-t flex items-center"><BookMarked className="w-4 h-4 mr-2"/>Suggested Resources:</h4>
              <ul className="list-disc list-inside text-sm space-y-1">
                {sessionAnalysis.suggested_resources.map((sr, i) => <li key={i}>{sr}</li>)}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-center mt-8">
        <Button variant="outline" onClick={() => router.push('/')}>Start New Session</Button>
      </div>
    </div>
  );
} 