'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useDeadLetters } from '@/hooks';
import { Loader2 } from 'lucide-react';
import type { DeadLetterStage } from '@/types/api';

const stageBadgeVariant: Record<DeadLetterStage, 'default' | 'secondary' | 'destructive'> = {
  fetch: 'default',
  normalize: 'secondary',
  cognify: 'destructive',
};

function formatTimeAgo(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return dateString;
  }
}

interface DeadLetterListProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectorId: string | null;
  connectorName: string;
}

export function DeadLetterList({
  open,
  onOpenChange,
  connectorId,
  connectorName,
}: DeadLetterListProps) {
  const { deadLetters, isLoading, error } = useDeadLetters(open ? connectorId : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {connectorName} — {deadLetters.length} failed items
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="text-sm text-destructive py-4">{error}</div>
        ) : deadLetters.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4">No failed items</div>
        ) : (
          <ScrollArea className="max-h-80">
            <div className="space-y-3">
              {deadLetters.map((dl) => (
                <div
                  key={dl.id}
                  className="border rounded-md p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm">{dl.artifact_id}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatTimeAgo(dl.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Stage:</span>
                    <Badge variant={stageBadgeVariant[dl.stage]} className="text-xs">
                      {dl.stage}
                    </Badge>
                  </div>
                  <p className="text-xs text-destructive line-clamp-2">
                    {dl.error}
                  </p>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <div className="flex justify-end">
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
