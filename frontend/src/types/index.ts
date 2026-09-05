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
  awsConnectionId?: number | null
  awsConnectionName?: string | null
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

export interface AwsConnection {
  id: number
  name: string
  companyId: number
  companyName: string
  defaultRegion: string
  accessKeyHint: string
  accountId: string | null
  lastCheckStatus: 'healthy' | 'unavailable' | null
  lastCheckMessage: string | null
  lastCheckedAt: string | null
  integrationCount: number
  createdAt: string
  updatedAt: string
}

export interface AwsLambdaFunction {
  functionName: string
  functionArn: string
  runtime: string | null
  memorySize: number
  timeout: number
  lastModified: string | null
  codeSize: number
  description: string
  importedIntegrationId: number | null
  importedWithConnectionId?: number | null
}

export interface LambdaSourceSnapshot {
  integrationId: number
  functionName: string
  region: string
  runtime: string | null
  handler: string | null
  codeSha256: string
  revisionId: string | null
  lastModified: string | null
  files: Record<string, string>
  excludedFiles: string[]
  editableBytes: number
}

export type LambdaSourceRevisionStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'publishing'
  | 'published'
  | 'rejected'
  | 'failed'

export interface LambdaSourceRevision {
  id: number
  integrationId: number
  revision: number
  status: LambdaSourceRevisionStatus
  baseCodeSha256: string
  summary: string
  changedFiles: string[]
  deletedFiles: string[]
  files?: Record<string, string>
  reviewRequestedAt: string | null
  approvedAt: string | null
  approvalNote: string | null
  publishedAt: string | null
  awsCodeSha256: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
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
  clientEditableFields: MappingEntryClientField[]
  lastClientEditedAt: string | null
  lastClientEditedByEmail: string | null
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
  uploadedByEmail: string | null
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
  revision: number
  status: 'draft' | 'published' | 'archived'
  clientEditMode: 'none' | 'all' | 'selected'
  clientCanAddEntries: boolean
  clientCanDeleteEntries: boolean
  clientInstructions: string | null
  validationRules: {
    requireStructuredEntries: boolean
    blockUnresolved: boolean
    blockDuplicateSources: boolean
    requireTypes: boolean
  }
  approvalStatus: 'not_requested' | 'pending' | 'approved' | 'rejected'
  approvalRevision: number | null
  approvalRequestedAt: string | null
  approvedAt: string | null
  approvalNote: string | null
  clonedFromMappingSetId: number | null
  lastClientEditedAt: string | null
  lastClientEditedByEmail: string | null
  lastReviewedAt: string | null
  lastReviewedByEmail: string | null
  hasUnreviewedClientChanges: boolean
  publishedAt: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
  entries: MappingEntry[]
  attachments: MappingAttachment[]
}

export type MappingChangeAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'publish'
  | 'archive'
  | 'clone'
  | 'upload'
  | 'review'
  | 'review_request'
  | 'comment'
  | 'restore'
  | 'bulk_import'
  | 'bulk_update'

export interface MappingChangedField {
  field: string
  before: unknown
  after: unknown
}

export interface MappingChange {
  id: number
  actorUserId: number | null
  actorEmail: string | null
  actorRole: 'admin' | 'client' | 'system'
  action: MappingChangeAction
  entityType: 'mapping_set' | 'mapping_entry' | 'attachment' | 'comment'
  entityId: string | null
  summary: string
  changedFields: MappingChangedField[]
  canRestore: boolean
  beforeData?: Record<string, unknown> | null
  afterData?: Record<string, unknown> | null
  mappingRevision: number
  createdAt: string
}

export type MappingEntryClientField =
  | 'section'
  | 'sourcePath'
  | 'sourceType'
  | 'targetPath'
  | 'targetType'
  | 'direction'
  | 'transformation'
  | 'fallbackValue'
  | 'isRequired'
  | 'notes'
  | 'examples'
  | 'mappingStatus'

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
  clientCanManageEffort: boolean
  effortAssessmentCount: number
  clientEditableFields: ProcessClientField[]
  isClientVisible: boolean
  archivedAt: string | null
  version: number
  latestUpdate: string | null
  createdAt: string
  updatedAt: string
  integrations?: Array<{
    id: number
    name: string
    functionName: string
  }>
  mappings?: Array<{
    id: number
    integrationId: number
    name: string
    sourceSystem: string
    targetSystem: string
    version: number
    revision: number
    status: MappingSet['status']
    pendingCount: number
    hasUnreviewedClientChanges: boolean
    updatedAt: string
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

export type ProcessClientField =
  | 'title'
  | 'description'
  | 'objective'
  | 'scope'
  | 'acceptanceCriteria'
  | 'tags'

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

export type ProcessEffortStage = 'baseline' | 'post_automation'
export type ProcessEffortSource = 'estimated' | 'observed' | 'system'
export type ProcessEffortStatus = 'draft' | 'confirmed'
export type ProcessEffortPeriodUnit = 'day' | 'week' | 'month' | 'quarter' | 'year'

export interface ProcessEffortItem {
  id?: number
  activityName: string
  roleName: string | null
  executionTimeMinutes: number
  executionsPerPeriod: number
  periodUnit: ProcessEffortPeriodUnit
  workingDaysPerMonth: number
  peopleCount: number
  monthlyHoursPerEmployee: number
  notes: string | null
  sortOrder?: number
}

export interface ProcessEffortAssessment {
  id: number
  processId: number
  stage: ProcessEffortStage
  label: string
  measuredAt: string
  source: ProcessEffortSource
  status: ProcessEffortStatus
  notes: string | null
  version: number
  confirmedAt: string | null
  createdAt: string
  updatedAt: string
  createdByEmail: string | null
  items: ProcessEffortItem[]
}

export interface ProcessEffortSummary {
  assessmentId: number
  label: string
  measuredAt: string
  status: ProcessEffortStatus
  activityCount: number
  executionsPerMonth: number
  elapsedHoursPerMonth: number
  workHoursPerMonth: number
  fteEquivalent: number
  items: Array<{
    id?: number
    executionsPerMonth: number
    elapsedHoursPerMonth: number
    workHoursPerMonth: number
    fteEquivalent: number
  }>
}

export interface ProcessEffortComparison {
  baseline: ProcessEffortSummary | null
  postAutomation: ProcessEffortSummary | null
  savings: {
    monthlyHours: number
    annualHours: number
    monthlyFte: number
    reductionPercent: number
  } | null
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

export interface McpAllowedDomains {
  logs: boolean
  processes: boolean
  mappings: boolean
  integrations: boolean
}

export type McpWriteScope =
  | 'processes:create'
  | 'processes:write'
  | 'processes:comment'
  | 'processes:checklist'
  | 'processes:deliveries'
  | 'processes:review'
  | 'mappings:write'
  | 'mappings:comment'
  | 'mappings:review'
  | 'mappings:publish'
  | 'integrations:source:read'
  | 'integrations:source:write'
  | 'integrations:source:review'

export interface CompanyMcpConfig {
  companyId: number
  companyName: string
  companyCreatedAt: string
  configId: number | null
  isEnabled: boolean
  apiKeyPrefix: string | null
  hasToken: boolean
  allowedDomains: McpAllowedDomains
  allowedScopes: McpWriteScope[]
  authorizedClientEmails: string[]
  maxRequestsPerMinute: number
  lastAccessedAt: string | null
  mcpCallsCount: number
}

export interface McpCompaniesResponse {
  companies: CompanyMcpConfig[]
  stats: {
    activeCompaniesCount: number
    mcpCallsToday: number
  }
}

export interface McpTokenResponse {
  success: boolean
  token: string
  prefix: string
  message: string
}
