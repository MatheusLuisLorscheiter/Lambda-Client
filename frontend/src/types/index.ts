export interface Integration {
  id: number
  name: string
  functionName: string
  region: string
  memoryMb?: number
  showCostEstimate?: boolean
  lifecycleStatus?: 'active' | 'paused' | 'maintenance'
  lastCheckStatus?: 'healthy' | 'degraded' | 'unavailable' | null
  lastCheckMessage?: string | null
  lastCheckedAt?: string | null
  documentationLinks?: string[]
  companyId?: number
  companyName?: string
  accessKeyId?: string
  secretAccessKey?: string
  userId: number
  clientId?: number | null
  processes?: Array<{
    id: number
    title: string
    status: ProcessStatus
  }>
}

export interface MappingEntry {
  id: number
  sourcePath: string
  sourceType: string | null
  targetPath: string
  targetType: string | null
  direction: 'source_to_target' | 'target_to_source' | 'bidirectional'
  transformation: string | null
  fallbackValue: string | null
  isRequired: boolean
  notes: string | null
  examples: Record<string, unknown>
  section: string | null
  mappingStatus: 'mapped' | 'pending' | 'attention' | 'ignored'
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface MappingAttachment {
  id: number
  fileName: string
  mimeType: string
  fileSize: number
  hasExtractedText: boolean
  createdAt: string
}

export interface MappingSet {
  id: number
  companyId: number
  integrationId: number
  processId: number | null
  processTitle: string | null
  name: string
  description: string | null
  contentMarkdown: string | null
  sourceSystem: string
  targetSystem: string
  version: number
  status: 'draft' | 'published' | 'archived'
  publishedAt: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
  entries: MappingEntry[]
  attachments: MappingAttachment[]
}

export interface ClientUser {
  id: number
  email: string
  role: 'client'
  isActive: boolean
  companyId: number
  companyName: string
}

export interface Company {
  id: number
  name: string
  createdAt?: string
}

export type ProcessStatus =
  | 'requested'
  | 'analysis'
  | 'queued'
  | 'in_progress'
  | 'validation'
  | 'delivered'
  | 'paused'
  | 'cancelled'

export interface ProcessItem {
  id: number
  referenceCode: string
  companyId: number
  companyName: string
  requestedBy: number | null
  requestedByEmail: string | null
  ownerUserId: number | null
  ownerEmail: string | null
  title: string
  description: string
  objective: string | null
  scope: string | null
  acceptanceCriteria: string | null
  category: 'automation' | 'integration' | 'maintenance' | 'improvement' | 'support'
  status: ProcessStatus
  priority: 'low' | 'normal' | 'high' | 'urgent'
  impact: 'low' | 'medium' | 'high' | 'critical'
  health: 'on_track' | 'at_risk' | 'off_track' | 'blocked'
  position: number | null
  complexity: 'simple' | 'medium' | 'complex' | null
  progress: number
  estimateBusinessDays: number | null
  plannedStart: string | null
  dueDate: string | null
  targetSlaAt: string | null
  deliveredAt: string | null
  blockedReason: string | null
  nextAction: string | null
  tags: string[]
  customFields?: Record<string, unknown>
  clientCanComment: boolean
  version: number
  latestUpdate: string | null
  createdAt: string
  updatedAt: string
  integrations?: Array<{
    id: number
    name: string
    functionName: string
  }>
  updates?: Array<{
    id: number
    parentId: number | null
    kind: 'update' | 'comment' | 'status' | 'decision' | 'delivery' | 'system'
    visibility: 'client' | 'internal'
    message: string
    metadata: Record<string, unknown>
    authorId: number | null
    authorEmail: string | null
    authorRole: 'admin' | 'client' | null
    editedAt: string | null
    createdAt: string
  }>
  checklist?: ProcessChecklistItem[]
  deliveries?: ProcessDelivery[]
}

export interface ProcessChecklistItem {
  id: number
  title: string
  description: string | null
  status: 'todo' | 'in_progress' | 'done' | 'blocked'
  assigneeUserId: number | null
  assigneeEmail: string | null
  dueDate: string | null
  sortOrder: number
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ProcessDelivery {
  id: number
  title: string
  summary: string
  version: string | null
  environment: 'development' | 'staging' | 'production'
  status: 'draft' | 'ready' | 'accepted' | 'rejected'
  artifactLinks: string[]
  releaseNotes: string | null
  rollbackPlan: string | null
  acceptanceNote: string | null
  deliveredAt: string | null
  acceptedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ProcessSummary {
  total: number
  awaitingAnalysis: number
  queued: number
  inExecution: number
  delivered: number
  needsAttention: number
  overdue: number
  averageProgress: number
  nextDueDate: string | null
}

export interface ParsedReport {
  durationMs: number | null
  billedDurationMs: number | null
  memorySizeMb: number | null
  maxMemoryUsedMb: number | null
  initDurationMs: number | null
  status?: string | null
}

export interface LogEntry {
  eventId?: string | null
  ingestionTime?: number | null
  timestamp: number
  message: string
  parsedReport?: ParsedReport | null
  simplifiedMessage?: string | null
  category?: string | null
  level?: 'info' | 'warn' | 'error' | null
}

export interface MetricDataResult {
  Id: string
  Label?: string
  Timestamps?: string[]
  Values?: number[]
  StatusCode?: string
}

export interface Metrics {
  invocations: number
  errors: number
  duration: number
  errorRate: number
  throttles: number
  concurrentExecutions: number
}

export interface MetricsResponse {
  metrics: MetricDataResult[]
  functionName: string
  costEstimate: CostEstimate | null
}

export interface CostEstimate {
  totalInvocations: number
  totalGBSeconds: number
  requestCost: number
  computeCost: number
  totalCost: number
  currency: string
  period: string
  pricingRegion?: string
  pricingSource?: 'standard' | 'fallback'
}

export interface ChartDataPoint {
  timestamp: Date
  value: number
}

export interface LogSummary {
  total: number
  reports: number
  errors: number
  avgDurationMs: number | null
  timeouts?: number
  startTime?: number | null
  endTime?: number | null
  topMessages?: Array<{ message: string; count: number }>
}

export interface LogsResponse {
  logs: LogEntry[]
  summary: LogSummary
  nextBefore?: number | null
  nextToken?: string | null
}

export interface AuditLog {
  id: number
  companyId: number
  companyName: string
  userId: number | null
  userEmail: string | null
  action: string
  resourceType: string | null
  resourceId: string | null
  metadata: Record<string, unknown> | null
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
}

export interface User {
  id: number
  email: string
  role: 'admin' | 'client'
  companyId: number
  companyName?: string
}
