'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, MessageSquare } from 'lucide-react';

interface AnswerPanelProps {
  answer: string | null;
  isLoading: boolean;
  error?: string | null;
  isCached?: boolean;
}

export function AnswerPanel({ answer, isLoading, error, isCached }: AnswerPanelProps) {
  if (error) {
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-red-500" />
            Answer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-600">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="glass">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="relative">
              <MessageSquare className="h-5 w-5 text-indigo-500" />
              <Sparkles className="absolute -top-1 -right-1 h-3 w-3 text-amber-500 animate-pulse" />
            </div>
            Thinking...
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full shimmer" />
          <Skeleton className="h-4 w-full shimmer" />
          <Skeleton className="h-4 w-3/4 shimmer" />
        </CardContent>
      </Card>
    );
  }

  if (!answer) {
    return null;
  }

  return (
    <Card className="glass border-indigo-100">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 text-white">
              <MessageSquare className="h-4 w-4" />
            </div>
            Answer
          </CardTitle>
          {isCached && (
            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full font-medium">
              Cached response
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{answer}</p>
      </CardContent>
    </Card>
  );
}

export function EmptyAnswerPanel() {
  return (
    <Card className="glass border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
          <MessageSquare className="h-5 w-5" />
          Answer
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          No grounded answer found in the connected sources.
          Try enabling live web search, or ask a narrower question.
        </p>
      </CardContent>
    </Card>
  );
}
