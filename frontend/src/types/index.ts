export interface Integration {
  id: number
  name: string
  functionName: string
  region: string
  memoryMb?: number
  companyId?: number
  companyName?: string
  accessKeyId?: string
  secretAccessKey?: string
  userId: number
  clientId?: number | null
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

export interface ParsedReport {
  durationMs: number | null
  billedDurationMs: number | null
  memorySizeMb: number | null
  maxMemoryUsedMb: number | null
  initDurationMs: number | null
}

export interface LogEntry {
  timestamp: number
  message: string
  parsedReport?: ParsedReport | null
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
}

export interface CostEstimate {
  totalInvocations: number
  totalGBSeconds: number
  requestCost: number
  computeCost: number
  totalCost: number
  currency: string
  period: string
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
}

export interface LogsResponse {
  logs: LogEntry[]
  summary: LogSummary
}

export interface AuditLog {
  id: number
  userId: number | null
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