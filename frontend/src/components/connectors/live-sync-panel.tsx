'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Check, X, Loader2, Clock } from 'lucide-react';
import { useJobStatus } from '@/hooks';
import type { ConnectorSpec } from '@/types/api';

interface LiveSyncPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string | null;
  spec: ConnectorSpec | null;
}

function formatElapsed(startedAt: string | null): string {
  if (!startedAt) return '00:00';
  const start = new Date(startedAt);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const mins = Math.floor(diffSecs / 60);
  const secs = diffSecs % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function LiveSyncPanel({ open, onOpenChange, jobId, spec }: LiveSyncPanelProps) {
  const { job, isLoading, isComplete } = useJobStatus(jobId);

  if (!spec) return null;

  const total = job?.total || 100;
  const fetchedPct = job ? (job.fetched / total) * 100 : 0;
  const ingestedPct = job ? (job.ingested / total) * 100 : 0;
  const cognifiedPct = job ? (job.cognified / total) * 100 : 0;

  const statusLabel = job?.state === 'done'
    ? 'Done'
    : job?.state === 'failed'
    ? 'Failed'
    : job?.state === 'running'
    ? 'Running'
    : 'Queued';

  const statusColor = job?.state === 'done'
    ? 'bg-green-500'
    : job?.state === 'failed'
    ? 'bg-red-500'
    : 'bg-blue-500';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Syncing {spec.display_name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Progress bars */}
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>Fetched</span>
                <span className="text-muted-foreground">
                  {job?.fetched || 0} / {total}
                </span>
              </div>
              <Progress value={fetchedPct} className="h-2" />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>Ingested</span>
                <span className="text-muted-foreground">
                  {job?.ingested || 0} / {total}
                </span>
              </div>
              <Progress value={ingestedPct} className="h-2" />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>Cognified</span>
                <span className="text-muted-foreground">
                  {job?.cognified || 0} / {total}
                </span>
              </div>
              <Progress value={cognifiedPct} className="h-2" />
            </div>

            {(job?.failed || 0) > 0 && (
              <div className="flex items-center justify-between text-sm text-amber-600">
                <span>Failed</span>
                <span>{job?.failed}</span>
              </div>
            )}
          </div>

          <Separator />

          {/* Status line */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>Elapsed {formatElapsed(job?.started_at || null)}</span>
            </div>
            <Badge variant="outline" className="gap-1.5">
              <span className={`h-2 w-2 rounded-full ${statusColor}`} />
              {statusLabel}
            </Badge>
          </div>

          {/* Error message */}
          {job?.state === 'failed' && job.error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {job.error}
            </div>
          )}

          {/* Activity log placeholder */}
          {!isComplete && (
            <div className="text-xs text-muted-foreground">
              <p>Recent activity</p>
              <ScrollArea className="h-20 mt-1 border rounded p-2">
                <div className="space-y-1">
                  {job && job.fetched > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Check className="h-3 w-3 text-green-500" />
                      <span>Fetching artifacts...</span>
                    </div>
                  )}
                  {job && job.ingested > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Check className="h-3 w-3 text-green-500" />
                      <span>Ingesting to graph...</span>
                    </div>
                  )}
                  {job && job.cognified > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Check className="h-3 w-3 text-green-500" />
                      <span>Running cognify...</span>
                    </div>
                  )}
                  {!job && (
                    <div className="flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Starting sync...</span>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          {isComplete ? (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Run in background
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
