'use client';

import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Circle,
  MoreHorizontal,
  RefreshCw,
  Pause,
  Trash2,
  AlertCircle,
  Zap,
  Loader2,
  FileText,
  Bug,
  MessageSquare,
  BookOpen,
  FileCode,
  Plug,
  FlaskConical,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConnectorState, ConnectorSpec, Connector } from '@/types/api';

// Connector icons and colors by spec_key
const connectorConfig: Record<string, { icon: React.ReactNode; gradient: string }> = {
  seed: { 
    icon: <FileText className="h-6 w-6" />, 
    gradient: 'from-slate-500 to-slate-600' 
  },
  jira: { 
    icon: <Bug className="h-6 w-6" />, 
    gradient: 'from-blue-500 to-blue-600' 
  },
  confluence: { 
    icon: <BookOpen className="h-6 w-6" />, 
    gradient: 'from-blue-600 to-indigo-600' 
  },
  slack: { 
    icon: <MessageSquare className="h-6 w-6" />, 
    gradient: 'from-purple-500 to-pink-500' 
  },
  sharepoint: { 
    icon: <FileCode className="h-6 w-6" />, 
    gradient: 'from-cyan-500 to-teal-500' 
  },
  generic: { 
    icon: <FlaskConical className="h-6 w-6" />, 
    gradient: 'from-amber-500 to-orange-500' 
  },
};

// State configuration
const stateConfig: Record<ConnectorState | 'AVAILABLE', {
  label: string;
  color: string;
  bgColor: string;
  icon: React.ReactNode;
}> = {
  AVAILABLE: {
    label: 'Available',
    color: 'text-slate-500',
    bgColor: 'bg-slate-100',
    icon: <Circle className="h-2 w-2" />,
  },
  VALIDATING: {
    label: 'Validating...',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  FAILED: {
    label: 'Failed',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    icon: <AlertCircle className="h-3 w-3" />,
  },
  CONNECTED: {
    label: 'Connected',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  SYNCING: {
    label: 'Syncing...',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  SYNCED: {
    label: 'Synced',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  DEGRADED: {
    label: 'Degraded',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    icon: <AlertCircle className="h-3 w-3" />,
  },
  DISABLED: {
    label: 'Disabled',
    color: 'text-slate-500',
    bgColor: 'bg-slate-100',
    icon: <Pause className="h-3 w-3" />,
  },
};

function formatTimeAgo(dateString: string | null): string {
  if (!dateString) return 'Never synced';
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

// Available connector card (not yet connected)
interface AvailableConnectorCardProps {
  spec: ConnectorSpec;
  onConnect: () => void;
}

export function AvailableConnectorCard({ spec, onConnect }: AvailableConnectorCardProps) {
  const config = connectorConfig[spec.key] || { icon: <Plug className="h-6 w-6" />, gradient: 'from-gray-500 to-gray-600' };
  const stateStyle = stateConfig.AVAILABLE;

  return (
    <Card className="glass border-dashed flex flex-col overflow-hidden">
      <CardContent className="flex-1 p-5">
        <div className="flex items-start gap-4">
          <div className={cn(
            'flex items-center justify-center w-12 h-12 rounded-xl text-white shadow-lg',
            `bg-gradient-to-br ${config.gradient}`,
            'opacity-50'
          )}>
            {config.icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground/80">{spec.display_name}</h3>
            <div className={cn(
              'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium mt-2',
              stateStyle.bgColor,
              stateStyle.color
            )}>
              {stateStyle.icon}
              {stateStyle.label}
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="p-4 pt-0">
        <Button onClick={onConnect} className="w-full" size="sm" variant="outline">
          <Plug className="h-4 w-4 mr-1.5" />
          Connect
        </Button>
      </CardFooter>
    </Card>
  );
}

// Connected connector card
interface ConnectedConnectorCardProps {
  connector: Connector;
  spec: ConnectorSpec;
  onSync: () => void;
  onDisable: () => void;
  onRemove: () => void;
  onViewDeadLetters?: () => void;
  isSyncing?: boolean;
}

export function ConnectedConnectorCard({
  connector,
  spec,
  onSync,
  onDisable,
  onRemove,
  onViewDeadLetters,
  isSyncing,
}: ConnectedConnectorCardProps) {
  const state = connector.state as ConnectorState;
  const stateStyle = stateConfig[state] || stateConfig.CONNECTED;
  const config = connectorConfig[spec.key] || { icon: <Plug className="h-6 w-6" />, gradient: 'from-gray-500 to-gray-600' };
  const isBusy = state === 'SYNCING' || state === 'VALIDATING' || isSyncing;
  const breakerOpen = connector.breaker_open_until && new Date(connector.breaker_open_until) > new Date();

  return (
    <Card className={cn(
      'glass flex flex-col overflow-hidden transition-all',
      state === 'FAILED' && 'border-red-200 bg-red-50/30',
      state === 'DEGRADED' && 'border-amber-200 bg-amber-50/30'
    )}>
      <CardContent className="flex-1 p-5">
        <div className="flex items-start gap-4">
          <div className={cn(
            'flex items-center justify-center w-12 h-12 rounded-xl text-white shadow-lg',
            `bg-gradient-to-br ${config.gradient}`
          )}>
            {config.icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold">{spec.display_name}</h3>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <div className={cn(
                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
                stateStyle.bgColor,
                stateStyle.color
              )}>
                {stateStyle.icon}
                {stateStyle.label}
              </div>
              {breakerOpen && (
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                  <Zap className="h-2.5 w-2.5" />
                  circuit open
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-4 pt-3 border-t border-border/50 space-y-1.5 text-sm">
          {connector.artifact_count !== undefined && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Artifacts</span>
              <span className="font-medium">{connector.artifact_count}</span>
            </div>
          )}
          {connector.last_sync_at && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Last sync</span>
              <span className="font-medium">{formatTimeAgo(connector.last_sync_at)}</span>
            </div>
          )}
          {state === 'CONNECTED' && !connector.last_sync_at && (
            <p className="text-muted-foreground text-xs">Never synced</p>
          )}
          {connector.dead_letter_count !== undefined && connector.dead_letter_count > 0 && (
            <div className="flex items-center justify-between text-amber-600">
              <span>Failed items</span>
              <span className="font-medium">{connector.dead_letter_count}</span>
            </div>
          )}
          {state === 'FAILED' && connector.last_error && (
            <p className="text-xs text-red-600 truncate" title={connector.last_error}>
              {connector.last_error}
            </p>
          )}
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0 flex gap-2">
        {/* Primary action */}
        {state === 'FAILED' ? (
          <Button onClick={onSync} className="flex-1" size="sm" variant="outline">
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Retry
          </Button>
        ) : state === 'DISABLED' ? (
          <Button onClick={onSync} className="flex-1" size="sm">
            Enable
          </Button>
        ) : (
          <Button
            onClick={onSync}
            className="flex-1"
            size="sm"
            disabled={isBusy}
          >
            {isBusy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-1.5" />
                Sync now
              </>
            )}
          </Button>
        )}

        {/* Overflow menu */}
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-lg border border-border bg-background/80 h-8 w-8 text-sm font-medium hover:bg-muted transition-colors">
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {state === 'DEGRADED' && onViewDeadLetters && (
              <DropdownMenuItem onClick={onViewDeadLetters}>
                <AlertCircle className="h-4 w-4 mr-2" />
                View dead letters
              </DropdownMenuItem>
            )}
            {state !== 'DISABLED' && (
              <DropdownMenuItem onClick={onDisable}>
                <Pause className="h-4 w-4 mr-2" />
                Disable
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onRemove} className="text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardFooter>
    </Card>
  );
}
