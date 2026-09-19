/**
 * Company Brain - API Client
 * Centralized API configuration and fetch utilities.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8010';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface FetchOptions extends RequestInit {
  timeout?: number;
}

/**
 * Base fetch function with error handling and timeout support
 */
async function apiFetch<T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const { timeout = 30000, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...fetchOptions.headers,
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new ApiError(
        response.status,
        errorBody.error || `Request failed with status ${response.status}`,
        errorBody.details
      );
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof ApiError) {
      throw error;
    }
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new ApiError(408, 'Request timeout');
      }
      throw new ApiError(0, error.message);
    }
    
    throw new ApiError(0, 'Unknown error occurred');
  }
}

// ============================================================================
// API Client Methods
// ============================================================================

export const api = {
  // Health & Ready
  health: () => apiFetch<{ status: string }>('/health'),
  ready: () => apiFetch<{
    status: 'ready' | 'degraded' | 'down';
    neo4j: boolean;
    postgres: boolean;
    cognee: boolean;
    details?: string;
  }>('/ready'),

  // Ask endpoints
  ask: (question: string, useWebSearch = false) =>
    apiFetch<{
      answer: string;
      trace_id: string;
      sources: Array<{
        id: string;
        title: string;
        source: string;
        updated_at: string;
        url: string | null;
      }>;
      web_results?: Array<{
        title: string;
        url: string;
        snippet: string;
      }>;
    }>('/ask', {
      method: 'POST',
      body: JSON.stringify({ question, use_web_search: useWebSearch }),
      timeout: 30000, // 30s for initial answer
    }),

  askDetails: (traceId: string) =>
    apiFetch<{
      path: {
        nodes: Array<{ name: string; type?: string }>;
        edges: Array<{ relationship: string }>;
      } | null;
      contradiction: {
        newer: { id: string; title: string; source: string; updated_at: string; url: string | null };
        older: { id: string; title: string; source: string; updated_at: string; url: string | null };
        topic?: string;
      } | null;
      source_status: Array<{
        source: string;
        status: string;
        artifact_count: number;
        last_sync_at: string | null;
      }>;
    }>(`/ask/${traceId}/details`, {
      timeout: 20000, // 20s for details
    }),

  // Source status
  sources: () =>
    apiFetch<
      Array<{
        source: string;
        status: 'synced' | 'unavailable' | 'not_connected' | 'degraded';
        artifact_count: number;
        last_sync_at: string | null;
        error?: string;
      }>
    >('/sources'),

  // Connector catalog
  connectorsCatalog: () =>
    apiFetch<
      Array<{
        key: string;
        display_name: string;
        transport: string;
        default_url: string | null;
        credential_fields: Array<{
          name: string;
          label: string;
          secret: boolean;
          placeholder?: string;
        }>;
        icon?: string;
      }>
    >('/connectors/catalog'),

  // Connected connectors
  connectors: () =>
    apiFetch<
      Array<{
        id: string;
        spec_key: string;
        state: string;
        config: Record<string, string>;
        watermark: string | null;
        last_error: string | null;
        failure_count: number;
        breaker_open_until: string | null;
        created_at: string;
        artifact_count?: number;
        dead_letter_count?: number;
        last_sync_at?: string | null;
      }>
    >('/connectors'),

  // Create connector
  createConnector: (data: {
    spec_key: string;
    config: Record<string, string>;
    credentials: Record<string, string>;
  }) =>
    apiFetch<{
      id: string;
      spec_key: string;
      state: string;
    }>('/connectors', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Sync connector
  syncConnector: (connectorId: string) =>
    apiFetch<{ job_id: string }>(`/connectors/${connectorId}/sync`, {
      method: 'POST',
    }),

  // Disable connector
  disableConnector: (connectorId: string) =>
    apiFetch<void>(`/connectors/${connectorId}/disable`, {
      method: 'POST',
    }),

  // Remove connector
  removeConnector: (connectorId: string) =>
    apiFetch<void>(`/connectors/${connectorId}`, {
      method: 'DELETE',
    }),

  // Job status
  job: (jobId: string) =>
    apiFetch<{
      id: string;
      connector_id: string;
      state: 'queued' | 'running' | 'done' | 'failed';
      fetched: number;
      ingested: number;
      cognified: number;
      failed: number;
      total?: number;
      started_at: string | null;
      completed_at: string | null;
      error?: string;
    }>(`/jobs/${jobId}`),

  // Dead letters for a connector
  deadLetters: (connectorId: string) =>
    apiFetch<
      Array<{
        id: string;
        connector_id: string;
        artifact_id: string;
        stage: 'fetch' | 'normalize' | 'cognify';
        error: string;
        payload?: Record<string, unknown>;
        created_at: string;
      }>
    >(`/connectors/${connectorId}/dead-letters`),
};

export { API_BASE_URL };
