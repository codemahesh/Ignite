'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import type { Contradiction } from '@/types/api';

interface ContradictionBannerProps {
  contradiction: Contradiction | null;
  isLoading: boolean;
  error?: string | null;
  onViewBoth?: () => void;
}

function formatDate(dateString: string): string {
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

export function ContradictionBanner({
  contradiction,
  isLoading,
  error,
  onViewBoth,
}: ContradictionBannerProps) {
  if (isLoading) {
    return (
      <Alert className="border-amber-200 bg-amber-50/50">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-amber-800">Checking for conflicts...</AlertTitle>
        <AlertDescription>
          <Skeleton className="h-4 w-full mt-1" />
        </AlertDescription>
      </Alert>
    );
  }

  if (error) {
    return null; // Don't show error for details - the answer is the main thing
  }

  if (!contradiction) {
    return null;
  }

  return (
    <Alert className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/50">
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <AlertTitle className="text-amber-800 dark:text-amber-200">
        Two sources disagree
      </AlertTitle>
      <AlertDescription className="flex items-start justify-between gap-4">
        <span className="text-amber-700 dark:text-amber-300">
          &ldquo;<strong>{contradiction.newer.title}</strong>&rdquo; ({formatDate(contradiction.newer.updated_at)})
          {' '}appears to supersede{' '}
          &ldquo;<strong>{contradiction.older.title}</strong>&rdquo; ({formatDate(contradiction.older.updated_at)}).
        </span>
        {onViewBoth && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onViewBoth}
            className="shrink-0 text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100"
          >
            View both
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
