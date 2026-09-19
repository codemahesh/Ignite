'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ExternalLink, FileText, Bug, MessageSquare, BookOpen, FileCode } from 'lucide-react';
import type { SourceReference } from '@/types/api';

// Source type icons
const sourceIcons: Record<string, React.ReactNode> = {
  jira: <Bug className="h-4 w-4 text-blue-500" />,
  confluence: <BookOpen className="h-4 w-4 text-blue-600" />,
  slack: <MessageSquare className="h-4 w-4 text-purple-500" />,
  sharepoint: <FileCode className="h-4 w-4 text-cyan-600" />,
  seed: <FileText className="h-4 w-4 text-gray-500" />,
};

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

interface SourceListProps {
  sources: SourceReference[];
  onSourceClick?: (source: SourceReference) => void;
}

export function SourceList({ sources }: SourceListProps) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Sources ({sources.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sources.map((source, index) => (
          <div
            key={source.id}
            className="flex items-center justify-between gap-4 p-2 rounded-md hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              {/* Index marker */}
              <span className="text-xs text-muted-foreground font-mono w-4">
                [{index + 1}]
              </span>
              
              {/* Source icon */}
              {sourceIcons[source.source] || <FileText className="h-4 w-4" />}
              
              {/* Title and meta */}
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{source.title}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="capitalize">{source.source}</span>
                  {' · '}
                  updated {formatDate(source.updated_at)}
                </p>
              </div>
            </div>

            {/* External link */}
            {source.url && (
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 p-2 rounded-md hover:bg-muted transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
