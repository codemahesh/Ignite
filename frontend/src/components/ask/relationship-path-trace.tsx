'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, GitBranch, Sparkles } from 'lucide-react';
import type { RelationshipPath } from '@/types/api';

interface RelationshipPathTraceProps {
  path: RelationshipPath | null;
  isLoading: boolean;
  error?: string | null;
}

export function RelationshipPathTrace({ path, isLoading, error }: RelationshipPathTraceProps) {
  if (isLoading) {
    return (
      <Card className="glass">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="relative">
              <GitBranch className="h-5 w-5 text-purple-500" />
              <Sparkles className="absolute -top-1 -right-1 h-3 w-3 text-amber-500 animate-pulse" />
            </div>
            Tracing relationships...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-28 rounded-lg shimmer" />
            <Skeleton className="h-4 w-4 rounded shimmer" />
            <Skeleton className="h-8 w-28 rounded-lg shimmer" />
            <Skeleton className="h-4 w-4 rounded shimmer" />
            <Skeleton className="h-8 w-28 rounded-lg shimmer" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return null;
  }

  // Hide panel entirely if no path found (never fabricate)
  if (!path || path.nodes.length === 0) {
    return null;
  }

  return (
    <Card className="glass border-purple-100">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 text-white">
            <GitBranch className="h-4 w-4" />
          </div>
          Relationship Path
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2">
          {path.nodes.map((node, index) => (
            <div key={index} className="flex items-center gap-2">
              {/* Node */}
              <div className="bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg">
                <span className="text-sm font-medium text-slate-700">{node.name}</span>
              </div>
              
              {/* Edge (if not last node) */}
              {index < path.edges.length && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <span className="text-xs font-mono bg-purple-50 text-purple-700 px-2 py-0.5 rounded">
                    {path.edges[index].relationship}
                  </span>
                  <ArrowRight className="h-4 w-4 text-purple-400" />
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
