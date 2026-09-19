'use client';

import { useState, useCallback } from 'react';
import {
  useConnectors,
  useCreateConnector,
  useConnectorActions,
} from '@/hooks';
import {
  AvailableConnectorCard,
  ConnectedConnectorCard,
  ConnectModal,
  LiveSyncPanel,
  DeadLetterList,
  DisableConnectorDialog,
  RemoveConnectorDialog,
} from '@/components/connectors';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Plug, Sparkles } from 'lucide-react';
import type { ConnectorSpec, Connector } from '@/types/api';

export default function ConnectorsPage() {
  const {
    catalog,
    connectors,
    isLoading,
    error,
    refresh,
    getConnectorsWithSpecs,
    getAvailableSpecs,
  } = useConnectors();

  const {
    createConnector,
    isCreating,
    error: createError,
    clearError: clearCreateError,
  } = useCreateConnector();

  const {
    syncConnector,
    disableConnector,
    removeConnector,
    isLoading: isActionLoading,
    error: actionError,
  } = useConnectorActions(refresh);

  // Modal states
  const [connectSpec, setConnectSpec] = useState<ConnectorSpec | null>(null);
  const [syncJobId, setSyncJobId] = useState<string | null>(null);
  const [syncSpec, setSyncSpec] = useState<ConnectorSpec | null>(null);
  const [deadLetterConnector, setDeadLetterConnector] = useState<{id: string, name: string} | null>(null);
  const [disableConnector_, setDisableConnector] = useState<{id: string, name: string} | null>(null);
  const [removeConnector_, setRemoveConnector] = useState<{id: string, name: string, count: number} | null>(null);

  // Handlers
  const handleConnect = useCallback(async (
    config: Record<string, string>,
    credentials: Record<string, string>
  ): Promise<boolean> => {
    if (!connectSpec) return false;
    const result = await createConnector(connectSpec.key, config, credentials);
    if (result) {
      refresh();
      return true;
    }
    return false;
  }, [connectSpec, createConnector, refresh]);

  const handleSync = useCallback(async (connector: Connector, spec: ConnectorSpec) => {
    const jobId = await syncConnector(connector.id);
    if (jobId) {
      setSyncJobId(jobId);
      setSyncSpec(spec);
    }
  }, [syncConnector]);

  const handleDisable = useCallback(async () => {
    if (!disableConnector_) return;
    await disableConnector(disableConnector_.id);
    setDisableConnector(null);
  }, [disableConnector_, disableConnector]);

  const handleRemove = useCallback(async () => {
    if (!removeConnector_) return;
    await removeConnector(removeConnector_.id);
    setRemoveConnector(null);
  }, [removeConnector_, removeConnector]);

  const connectedWithSpecs = getConnectorsWithSpecs();
  const availableSpecs = getAvailableSpecs();

  if (isLoading) {
    return (
      <div className="container max-w-5xl mx-auto px-4 py-8 md:py-12">
        <div className="space-y-8">
          <div>
            <Skeleton className="h-10 w-48 mb-2" />
            <Skeleton className="h-5 w-96" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl mx-auto px-4 py-8 md:py-12">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/25 float">
            <Plug className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">
              <span className="gradient-text">Connectors</span>
            </h1>
            <p className="text-muted-foreground mt-1">
              Data sources feeding the knowledge graph. Connect one to grow it.
            </p>
          </div>
        </div>

        {/* Error */}
        {(error || actionError) && (
          <Alert variant="destructive" className="glass border-red-200">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error || actionError}</AlertDescription>
          </Alert>
        )}

        {/* Stats bar */}
        {connectedWithSpecs.length > 0 && (
          <div className="glass rounded-xl p-4 flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium">
                {connectedWithSpecs.length} connected
              </span>
            </div>
            <div className="h-4 w-px bg-border" />
            <span className="text-sm text-muted-foreground">
              {connectedWithSpecs.reduce((sum, c) => sum + (c.artifact_count || 0), 0)} total artifacts
            </span>
            <div className="h-4 w-px bg-border" />
            <span className="text-sm text-muted-foreground">
              {availableSpecs.length} available to connect
            </span>
          </div>
        )}

        {/* Connector Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Connected connectors */}
          {connectedWithSpecs.map((connector) => (
            <div key={connector.id} className="hover-lift">
              <ConnectedConnectorCard
                connector={connector}
                spec={connector.spec}
                onSync={() => handleSync(connector, connector.spec)}
                onDisable={() => setDisableConnector({ id: connector.id, name: connector.spec.display_name })}
                onRemove={() => setRemoveConnector({
                  id: connector.id,
                  name: connector.spec.display_name,
                  count: connector.artifact_count || 0,
                })}
                onViewDeadLetters={() => setDeadLetterConnector({
                  id: connector.id,
                  name: connector.spec.display_name,
                })}
                isSyncing={connector.state === 'SYNCING'}
              />
            </div>
          ))}

          {/* Available connectors */}
          {availableSpecs.map((spec) => (
            <div key={spec.key} className="hover-lift">
              <AvailableConnectorCard
                spec={spec}
                onConnect={() => setConnectSpec(spec)}
              />
            </div>
          ))}
        </div>

        {/* Empty state */}
        {catalog.length === 0 && (
          <div className="glass rounded-xl text-center py-16 px-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <Plug className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-lg font-medium">No connectors available</p>
            <p className="text-sm text-muted-foreground mt-1">
              The connector catalog is empty. Add connector definitions to get started.
            </p>
          </div>
        )}
      </div>

      {/* Modals */}
      <ConnectModal
        spec={connectSpec}
        open={connectSpec !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConnectSpec(null);
            clearCreateError();
          }
        }}
        onConnect={handleConnect}
        isConnecting={isCreating}
        error={createError}
      />

      <LiveSyncPanel
        open={syncJobId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSyncJobId(null);
            setSyncSpec(null);
            refresh();
          }
        }}
        jobId={syncJobId}
        spec={syncSpec}
      />

      <DeadLetterList
        open={deadLetterConnector !== null}
        onOpenChange={(open) => {
          if (!open) setDeadLetterConnector(null);
        }}
        connectorId={deadLetterConnector?.id || null}
        connectorName={deadLetterConnector?.name || ''}
      />

      <DisableConnectorDialog
        open={disableConnector_ !== null}
        onOpenChange={(open) => {
          if (!open) setDisableConnector(null);
        }}
        connectorName={disableConnector_?.name || ''}
        onConfirm={handleDisable}
        isLoading={isActionLoading}
      />

      <RemoveConnectorDialog
        open={removeConnector_ !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveConnector(null);
        }}
        connectorName={removeConnector_?.name || ''}
        artifactCount={removeConnector_?.count || 0}
        onConfirm={handleRemove}
        isLoading={isActionLoading}
      />
    </div>
  );
}
