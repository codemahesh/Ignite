import { useState, useEffect, useCallback } from 'react';
import { api, ApiError } from '@/lib/api';
import type { ConnectorSpec, Connector, ConnectorWithSpec, SyncJob, DeadLetter } from '@/types/api';

interface ConnectorsState {
  catalog: ConnectorSpec[];
  connectors: Connector[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook to manage connectors catalog and registry
 */
export function useConnectors(pollInterval = 10000) {
  const [state, setState] = useState<ConnectorsState>({
    catalog: [],
    connectors: [],
    isLoading: true,
    error: null,
  });

  const fetchData = useCallback(async () => {
    try {
      const [catalog, connectors] = await Promise.all([
        api.connectorsCatalog(),
        api.connectors(),
      ]);

      setState({
        catalog: catalog as ConnectorSpec[],
        connectors: connectors as Connector[],
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof ApiError ? error.message : 'Failed to load connectors',
      }));
    }
  }, []);

  useEffect(() => {
    fetchData();
    if (pollInterval > 0) {
      const interval = setInterval(fetchData, pollInterval);
      return () => clearInterval(interval);
    }
  }, [fetchData, pollInterval]);

  // Get combined view of connectors with their specs
  const getConnectorsWithSpecs = useCallback((): ConnectorWithSpec[] => {
    return state.connectors.map(connector => ({
      ...connector,
      spec: state.catalog.find(s => s.key === connector.spec_key)!,
    })).filter(c => c.spec); // Filter out any without matching spec
  }, [state.catalog, state.connectors]);

  // Get available (not connected) specs
  const getAvailableSpecs = useCallback((): ConnectorSpec[] => {
    const connectedKeys = new Set(state.connectors.map(c => c.spec_key));
    return state.catalog.filter(spec => !connectedKeys.has(spec.key));
  }, [state.catalog, state.connectors]);

  // Check if any connector has issues
  const hasIssues = state.connectors.some(
    c => c.state === 'FAILED' || c.state === 'DEGRADED'
  );

  return {
    ...state,
    refresh: fetchData,
    getConnectorsWithSpecs,
    getAvailableSpecs,
    hasIssues,
  };
}

/**
 * Hook to create a new connector
 */
export function useCreateConnector() {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createConnector = useCallback(async (
    specKey: string,
    config: Record<string, string>,
    credentials: Record<string, string>
  ): Promise<{ id: string } | null> => {
    setIsCreating(true);
    setError(null);

    try {
      const result = await api.createConnector({ spec_key: specKey, config, credentials });
      setIsCreating(false);
      return result;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to create connector';
      setError(message);
      setIsCreating(false);
      return null;
    }
  }, []);

  return { createConnector, isCreating, error, clearError: () => setError(null) };
}

/**
 * Hook to manage connector actions (sync, disable, remove)
 */
export function useConnectorActions(onSuccess?: () => void) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncConnector = useCallback(async (connectorId: string): Promise<string | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await api.syncConnector(connectorId);
      setIsLoading(false);
      onSuccess?.();
      return result.job_id;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to start sync';
      setError(message);
      setIsLoading(false);
      return null;
    }
  }, [onSuccess]);

  const disableConnector = useCallback(async (connectorId: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      await api.disableConnector(connectorId);
      setIsLoading(false);
      onSuccess?.();
      return true;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to disable connector';
      setError(message);
      setIsLoading(false);
      return false;
    }
  }, [onSuccess]);

  const removeConnector = useCallback(async (connectorId: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      await api.removeConnector(connectorId);
      setIsLoading(false);
      onSuccess?.();
      return true;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to remove connector';
      setError(message);
      setIsLoading(false);
      return false;
    }
  }, [onSuccess]);

  return {
    syncConnector,
    disableConnector,
    removeConnector,
    isLoading,
    error,
    clearError: () => setError(null),
  };
}

/**
 * Hook to poll job status during sync
 */
export function useJobStatus(jobId: string | null, pollInterval = 1000) {
  const [job, setJob] = useState<SyncJob | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchJob = useCallback(async () => {
    if (!jobId) return;

    try {
      const result = await api.job(jobId);
      setJob(result as SyncJob);
      setIsLoading(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to fetch job status');
      setIsLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      return;
    }

    setIsLoading(true);
    fetchJob();

    // Only poll if job is not complete
    const interval = setInterval(() => {
      if (job?.state === 'done' || job?.state === 'failed') {
        return;
      }
      fetchJob();
    }, pollInterval);

    return () => clearInterval(interval);
  }, [jobId, fetchJob, pollInterval, job?.state]);

  const isComplete = job?.state === 'done' || job?.state === 'failed';

  return { job, isLoading, error, isComplete };
}

/**
 * Hook to fetch dead letters for a connector
 */
export function useDeadLetters(connectorId: string | null) {
  const [deadLetters, setDeadLetters] = useState<DeadLetter[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDeadLetters = useCallback(async () => {
    if (!connectorId) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await api.deadLetters(connectorId);
      setDeadLetters(result as DeadLetter[]);
      setIsLoading(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to fetch dead letters');
      setIsLoading(false);
    }
  }, [connectorId]);

  useEffect(() => {
    if (connectorId) {
      fetchDeadLetters();
    } else {
      setDeadLetters([]);
    }
  }, [connectorId, fetchDeadLetters]);

  return { deadLetters, isLoading, error, refresh: fetchDeadLetters };
}
