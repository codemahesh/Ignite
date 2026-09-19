'use client';

import { useState, useCallback } from 'react';
import { useAsk } from '@/hooks';
import {
  AskBox,
  WebSearchToggle,
  RehearsedQuestionChips,
  SourceCoverageLine,
  AnswerPanel,
  ContradictionBanner,
  RelationshipPathTrace,
  SourceList,
  ExternalResultsPanel,
} from '@/components/ask';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw, Sparkles, Search, Brain } from 'lucide-react';

export default function AskPage() {
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [submittedQuestion, setSubmittedQuestion] = useState<string | null>(null);
  
  const {
    isLoading,
    isLoadingDetails,
    error,
    answer,
    sources,
    webResults,
    path,
    contradiction,
    isCached,
    ask,
    reset,
  } = useAsk();

  const handleSubmit = useCallback((question: string) => {
    setSubmittedQuestion(question);
    ask(question, useWebSearch);
  }, [ask, useWebSearch]);

  const handleNewQuestion = useCallback(() => {
    setSubmittedQuestion(null);
    reset();
  }, [reset]);

  const hasAnswer = answer !== null;

  return (
    <div className="container max-w-3xl mx-auto px-4 py-8 md:py-12">
      <div className="space-y-8">
        {/* Header - only show when no answer */}
        {!hasAnswer && (
          <div className="text-center space-y-4 py-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/25 mb-4 float">
              <Brain className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold">
              <span className="gradient-text">Ask anything</span>
              <br />
              <span className="text-foreground/80">about your company&apos;s knowledge</span>
            </h1>
            <p className="text-muted-foreground max-w-md mx-auto">
              Get instant answers from your connected data sources, with full source attribution and conflict detection.
            </p>
          </div>
        )}

        {/* Ask Box */}
        <div className="space-y-4">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-pink-500/20 rounded-xl blur-xl opacity-50" />
            <div className="relative glass rounded-xl p-4 shadow-lg">
              <AskBox
                onSubmit={handleSubmit}
                isLoading={isLoading}
                defaultValue={submittedQuestion || ''}
                placeholder='e.g. "Why did the platform deploy fail last week?"'
              />
            </div>
          </div>
          
          <div className="flex items-center justify-between px-1">
            <WebSearchToggle
              checked={useWebSearch}
              onCheckedChange={setUseWebSearch}
              disabled={isLoading}
            />
            
            {hasAnswer && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNewQuestion}
                className="hover-lift"
              >
                <RefreshCw className="h-4 w-4 mr-1.5" />
                New question
              </Button>
            )}
          </div>
        </div>

        {/* Rehearsed Questions - only show when no answer */}
        {!hasAnswer && !isLoading && (
          <div className="glass rounded-xl p-5 shadow-sm">
            <RehearsedQuestionChips
              onSelect={handleSubmit}
              disabled={isLoading}
            />
          </div>
        )}

        {/* Error State */}
        {error && (
          <Alert variant="destructive" className="glass border-red-200">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>{error}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => submittedQuestion && handleSubmit(submittedQuestion)}
                className="hover-lift"
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Cached Response Banner */}
        {isCached && (
          <Alert className="glass border-amber-200 bg-amber-50/50">
            <Sparkles className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              Serving a cached response (rate limit reached or timeout)
            </AlertDescription>
          </Alert>
        )}

        {/* Results */}
        {(isLoading || hasAnswer) && (
          <div className="space-y-4">
            {/* Answer Panel */}
            <div className="hover-lift">
              <AnswerPanel
                answer={answer}
                isLoading={isLoading}
                error={null}
                isCached={isCached}
              />
            </div>

            {/* Contradiction Banner */}
            {hasAnswer && (
              <ContradictionBanner
                contradiction={contradiction}
                isLoading={isLoadingDetails}
              />
            )}

            {/* Relationship Path */}
            {hasAnswer && (
              <div className="hover-lift">
                <RelationshipPathTrace
                  path={path}
                  isLoading={isLoadingDetails}
                />
              </div>
            )}

            {/* Sources */}
            {hasAnswer && sources.length > 0 && (
              <div className="hover-lift">
                <SourceList sources={sources} />
              </div>
            )}

            {/* External Results (Tavily) */}
            {hasAnswer && webResults.length > 0 && (
              <div className="hover-lift">
                <ExternalResultsPanel results={webResults} />
              </div>
            )}
          </div>
        )}

        {/* Source Coverage Line */}
        <div className="pt-4 border-t border-border/50">
          <SourceCoverageLine />
        </div>
      </div>
    </div>
  );
}
