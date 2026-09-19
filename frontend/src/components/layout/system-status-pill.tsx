'use client';

import { useHealth } from '@/hooks';
import type { SystemStatus } from '@/hooks';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Circle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const statusConfig: Record<SystemStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; color: string }> = {
  ready: { label: 'Ready', variant: 'default', color: 'text-green-500' },
  degraded: { label: 'Degraded', variant: 'secondary', color: 'text-amber-500' },
  down: { label: 'Down', variant: 'destructive', color: 'text-red-500' },
  loading: { label: 'Checking...', variant: 'outline', color: 'text-muted-foreground' },
  error: { label: 'Error', variant: 'destructive', color: 'text-red-500' },
};

export function SystemStatusPill() {
  const { status, neo4j, postgres, cognee, details, error } = useHealth();
  const config = statusConfig[status];

  const tooltipContent = (
    <div className="space-y-1 text-xs">
      <div className="font-medium">System Status</div>
      <div className="flex items-center gap-2">
        <Circle className={cn('h-2 w-2 fill-current', neo4j ? 'text-green-500' : 'text-red-500')} />
        Neo4j: {neo4j ? 'Connected' : 'Disconnected'}
      </div>
      <div className="flex items-center gap-2">
        <Circle className={cn('h-2 w-2 fill-current', postgres ? 'text-green-500' : 'text-red-500')} />
        Postgres: {postgres ? 'Connected' : 'Disconnected'}
      </div>
      <div className="flex items-center gap-2">
        <Circle className={cn('h-2 w-2 fill-current', cognee ? 'text-green-500' : 'text-red-500')} />
        Cognee: {cognee ? 'Configured' : 'Not configured'}
      </div>
      {details && <div className="text-muted-foreground pt-1">{details}</div>}
      {error && <div className="text-destructive pt-1">{error}</div>}
    </div>
  );

  return (
    <Tooltip>
      <TooltipTrigger>
        <Badge variant={config.variant} className="gap-1.5 cursor-help">
          {status === 'loading' ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Circle className={cn('h-2 w-2 fill-current', config.color)} />
          )}
          {config.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end">
        {tooltipContent}
      </TooltipContent>
    </Tooltip>
  );
}
