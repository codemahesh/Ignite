'use client';

import { useState } from 'react';
import { useSources } from '@/hooks';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SourceSyncStatus } from '@/types/api';

const statusConfig: Record<SourceSyncStatus, { color: string; filled: boolean }> = {
  synced: { color: 'text-green-500', filled: true },
  degraded: { color: 'text-amber-500', filled: true },
  unavailable: { color: 'text-muted-foreground', filled: false },
  not_connected: { color: 'text-muted-foreground', filled: false },
};

export function SourceCoverageLine() {
  const { sources, totalArtifacts, activeSources, isLoading } = useSources();
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground animate-pulse">
        Loading sources...
      </div>
    );
  }

  const sourceList = activeSources.length > 0
    ? activeSources.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' + ')
    : 'No sources';

  return (
    <div className="space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        Answering from <span className="font-medium text-foreground">{totalArtifacts}</span> artifacts across{' '}
        <span className="font-medium text-foreground">{sourceList}</span>
        <span className="inline-flex items-center gap-0.5">
          · Sources {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </span>
      </button>

      {expanded && (
        <div className="flex flex-wrap gap-2 pl-1">
          {sources.map((source) => {
            const config = statusConfig[source.status];
            return (
              <Badge
                key={source.source}
                variant="outline"
                className="gap-1.5 text-xs font-normal"
              >
                <Circle
                  className={cn(
                    'h-2 w-2',
                    config.color,
                    config.filled && 'fill-current'
                  )}
                />
                <span className="capitalize">{source.source}</span>
                {source.artifact_count > 0 && (
                  <span className="text-muted-foreground">{source.artifact_count}</span>
                )}
                {source.status === 'unavailable' && (
                  <span className="text-muted-foreground">unavailable</span>
                )}
                {source.status === 'not_connected' && (
                  <span className="text-muted-foreground">not connected</span>
                )}
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
