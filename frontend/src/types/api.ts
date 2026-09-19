/**
 * Company Brain - API Types
 * These types match the backend API schemas from the architecture documents.
 * When the backend is ready, ensure these align with the actual API responses.
 */

// ============================================================================
// Core Data Types (from PS-2_Company_Brain_Architecture)
// ============================================================================

/** Canonical artifact envelope - every connector emits this shape */
export interface Artifact {
  id: string;              // stable, source-prefixed: "jira:PLAT-412"
  source: ArtifactSource;  // confluence | jira | sharepoint | slack | seed
  type: ArtifactType;      // policy | decision | ticket | message | meeting_note
  title: string;
  body: string;            // plain text
  author: string | null;
  created_at: string;      // ISO 8601
  updated_at: string;      // ISO 8601 - drives contradiction resolution
  url: string | null;
  topic: string | null;    // coarse tag, used for conflict grouping
}

export type ArtifactSource = 'confluence' | 'jira' | 'sharepoint' | 'slack' | 'seed';

export type ArtifactType = 'policy' | 'decision' | 'ticket' | 'message' | 'meeting_note';

// ============================================================================
// Connector Types (from PS-2_Architecture_v2_Dynamic_Connectors)
// ============================================================================

/** Credential field definition for connector configuration */
export interface CredentialField {
  name: string;
  label: string;
  secret: boolean;
  placeholder?: string;
}

/** Static catalog entry - what connector types exist */
export interface ConnectorSpec {
  key: string;              // "jira"
  display_name: string;
  transport: 'streamable_http' | 'stdio';
  default_url: string | null;
  credential_fields: CredentialField[];
  icon?: string;            // optional icon identifier
}

/** Connector lifecycle states (from v2 §2.2) */
export type ConnectorState = 
  | 'AVAILABLE'    // in catalog, not connected
  | 'VALIDATING'   // handshake + tools/list + capability check
  | 'FAILED'       // validation or connection failed
  | 'CONNECTED'    // ready, never synced
  | 'SYNCING'      // sync in progress
  | 'SYNCED'       // successfully synced
  | 'DEGRADED'     // some items dead-lettered
  | 'DISABLED';    // user paused; data retained

/** Connected connector instance (registry row) */
export interface Connector {
  id: string;               // UUID
  spec_key: string;         // FK into catalog
  state: ConnectorState;
  config: Record<string, string>;  // non-secret: url, project key, space
  watermark: string | null;        // ISO 8601
  last_error: string | null;
  failure_count: number;
  breaker_open_until: string | null;  // ISO 8601
  created_at: string;       // ISO 8601
  artifact_count?: number;  // aggregated count
  dead_letter_count?: number;
  last_sync_at?: string | null;
}

/** Combined view for UI - connector with its spec */
export interface ConnectorWithSpec extends Connector {
  spec: ConnectorSpec;
}

// ============================================================================
// Job Types (from v2 §6)
// ============================================================================

export type JobState = 'queued' | 'running' | 'done' | 'failed';

export interface SyncJob {
  id: string;
  connector_id: string;
  state: JobState;
  fetched: number;
  ingested: number;
  cognified: number;
  failed: number;
  total?: number;
  started_at: string | null;
  completed_at: string | null;
  error?: string;
}

// ============================================================================
// Ask/Query Types (from v1 §4 & §5, v2 §6)
// ============================================================================

/** Request body for POST /ask */
export interface AskRequest {
  question: string;
  use_web_search?: boolean;
}

/** Source reference in the answer */
export interface SourceReference {
  id: string;               // artifact ID
  title: string;
  source: ArtifactSource;
  updated_at: string;       // ISO 8601
  url: string | null;
}

/** Relationship path node */
export interface PathNode {
  name: string;
  type?: string;
}

/** Relationship path edge */
export interface PathEdge {
  relationship: string;
}

/** Complete relationship path from Cypher query */
export interface RelationshipPath {
  nodes: PathNode[];
  edges: PathEdge[];
}

/** Contradiction detection result */
export interface Contradiction {
  newer: SourceReference;
  older: SourceReference;
  topic?: string;
}

/** Web search result (Tavily) */
export interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

/** Initial response from POST /ask (fast path) */
export interface AskResponse {
  answer: string;
  trace_id: string;
  sources: SourceReference[];
  web_results?: WebResult[];
}

/** Detailed response from GET /ask/{trace_id}/details (slow path) */
export interface AskDetails {
  path: RelationshipPath | null;
  contradiction: Contradiction | null;
  source_status: SourceStatus[];
}

// ============================================================================
// Source Status Types
// ============================================================================

export type SourceSyncStatus = 'synced' | 'unavailable' | 'not_connected' | 'degraded';

export interface SourceStatus {
  source: ArtifactSource | string;
  status: SourceSyncStatus;
  artifact_count: number;
  last_sync_at: string | null;
  error?: string;
}

// ============================================================================
// Health/Ready Types
// ============================================================================

export interface HealthResponse {
  status: 'ok' | 'error';
}

export interface ReadyResponse {
  status: 'ready' | 'degraded' | 'down';
  neo4j: boolean;
  postgres: boolean;
  cognee: boolean;
  details?: string;
}

// ============================================================================
// Dead Letter Types
// ============================================================================

export type DeadLetterStage = 'fetch' | 'normalize' | 'cognify';

export interface DeadLetter {
  id: string;
  connector_id: string;
  artifact_id: string;
  stage: DeadLetterStage;
  error: string;
  payload?: Record<string, unknown>;
  created_at: string;
}

// ============================================================================
// API Response Wrappers
// ============================================================================

export interface ApiError {
  error: string;
  details?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
}

// ============================================================================
// Request Types
// ============================================================================

/** Request body for POST /connectors */
export interface CreateConnectorRequest {
  spec_key: string;
  config: Record<string, string>;
  credentials: Record<string, string>;
}

/** Request body for POST /connectors/{id}/sync */
export interface SyncConnectorResponse {
  job_id: string;
}
