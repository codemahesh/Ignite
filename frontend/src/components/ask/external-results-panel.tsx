'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Globe } from 'lucide-react';
import type { WebResult } from '@/types/api';

interface ExternalResultsPanelProps {
  results: WebResult[];
}

export function ExternalResultsPanel({ results }: ExternalResultsPanelProps) {
  if (results.length === 0) {
    return null;
  }

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4" />
            External (Tavily)
          </CardTitle>
          <Badge variant="outline" className="text-xs font-normal">
            Not from company data
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {results.map((result, index) => (
          <div
            key={index}
            className="flex items-start justify-between gap-4 p-2 rounded-md hover:bg-muted/50 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
              >
                {result.title}
                <ExternalLink className="h-3 w-3" />
              </a>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {result.snippet}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {new URL(result.url).hostname}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
