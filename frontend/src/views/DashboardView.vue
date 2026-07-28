<template>
  <div class="min-h-screen bg-slate-50 text-slate-900">
    <nav class="border-b border-slate-200 bg-white">
      <div class="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div class="flex min-w-0 items-center gap-3">
          <img :src="logoDark" alt="Lambda Pulse" class="h-8 w-auto" />
          <div class="min-w-0">
            <h1 class="text-base font-semibold leading-tight">Lambda Pulse</h1>
            <p class="truncate text-xs text-slate-500">{{ auth.user?.companyName }}</p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <p class="hidden text-sm text-slate-500 sm:block">{{ auth.user?.email }}</p>
          <button @click="handleLogout" class="inline-flex min-h-10 items-center rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Sair
          </button>
        </div>
      </div>
    </nav>

    <main class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header class="mb-6 border-b border-slate-200 pb-5">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 class="text-2xl font-semibold tracking-tight">{{ pageTitle }}</h2>
            <p class="mt-1 text-sm text-slate-500">{{ pageDescription }}</p>
          </div>
          <nav class="flex max-w-full gap-1 overflow-x-auto" aria-label="Áreas do portal">
            <button v-for="tab in portalTabs" :key="tab.value" @click="activeTab = tab.value"
              class="whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors"
              :class="activeTab === tab.value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'">
              {{ tab.label }}
            </button>
          </nav>
        </div>
      </header>

      <ProcessPortal v-if="activeTab === 'overview' || activeTab === 'queue'" :mode="activeTab" @open-queue="activeTab = 'queue'" @open-automation="openDashboard" @open-mapping="openMapping" />

      <section v-if="activeTab === 'dashboard'" class="space-y-6">
        <div class="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div class="grid w-full gap-3 sm:grid-cols-2 lg:max-w-2xl">
            <label class="block">
              <span class="mb-1.5 block text-sm font-medium">Função Lambda</span>
              <select v-model="selectedIntegrationId" @change="loadData" class="block min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-slate-900 focus:outline-none">
                <option value="">Selecione uma função</option>
                <option v-for="integration in integrations" :key="integration.id" :value="String(integration.id)">{{ integration.name }} · {{ integration.functionName }}</option>
              </select>
            </label>
            <label class="block">
              <span class="mb-1.5 block text-sm font-medium">Período</span>
              <select v-model="timePeriod" @change="loadData" class="block min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-slate-900 focus:outline-none">
                <option value="1">Últimas 24 horas</option><option value="7">Últimos 7 dias</option><option value="14">Últimos 14 dias</option><option value="30">Últimos 30 dias</option>
              </select>
            </label>
          </div>
          <button @click="refreshData" :disabled="!selectedIntegrationId || isLoading" class="inline-flex min-h-11 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
            <span v-if="isLoading">Atualizando…</span><span v-else>Atualizar dados</span>
          </button>
        </div>

        <div v-if="!selectedIntegrationId" class="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <h3 class="font-semibold">Escolha uma função para começar</h3>
          <p class="mt-1 text-sm text-slate-500">Você verá a saúde, os erros e os eventos recentes da automação selecionada.</p>
        </div>

        <template v-else>
          <section class="rounded-lg border p-4 sm:p-5" :class="healthTone.container">
            <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex items-start gap-3">
                <span class="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" :class="healthTone.dot"></span>
                <div>
                  <p class="text-sm font-semibold" :class="healthTone.text">{{ healthLabel }}</p>
                  <p class="mt-1 text-sm text-slate-600">{{ healthDescription }}</p>
                </div>
              </div>
              <button v-if="metrics.errors > 0" @click="focusErrors" class="min-h-10 rounded-md border border-current px-3 text-sm font-medium" :class="healthTone.text">Ver erros recentes</button>
            </div>
          </section>

          <section aria-label="Resumo do período" class="grid gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
            <div class="bg-white p-4 sm:p-5"><p class="text-sm text-slate-500">Invocações</p><p class="mt-2 text-2xl font-semibold tracking-tight">{{ formatNumber(metrics.invocations) }}</p><p class="mt-1 text-xs text-slate-500">no período selecionado</p></div>
            <div class="bg-white p-4 sm:p-5"><p class="text-sm text-slate-500">Taxa de erro</p><p class="mt-2 text-2xl font-semibold tracking-tight" :class="metrics.errors > 0 ? healthTone.text : ''">{{ metrics.errorRate.toFixed(2) }}%</p><p class="mt-1 text-xs text-slate-500">{{ formatNumber(metrics.errors) }} erro{{ metrics.errors === 1 ? '' : 's' }}</p></div>
            <div class="bg-white p-4 sm:p-5"><p class="text-sm text-slate-500">Duração média</p><p class="mt-2 text-2xl font-semibold tracking-tight">{{ formatDuration(metrics.duration) }}</p><p class="mt-1 text-xs text-slate-500">por execução</p></div>
            <div class="bg-white p-4 sm:p-5"><p class="text-sm text-slate-500">Limitações</p><p class="mt-2 text-2xl font-semibold tracking-tight" :class="metrics.throttles > 0 ? 'text-amber-700' : ''">{{ formatNumber(metrics.throttles) }}</p><p class="mt-1 text-xs text-slate-500">throttles identificados</p></div>
          </section>

          <section class="grid gap-6 xl:grid-cols-3">
            <div class="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
              <div class="mb-4 flex items-baseline justify-between gap-3"><h3 class="font-semibold">Volume de execuções</h3><span class="text-xs text-slate-500">{{ periodLabel }}</span></div>
              <div class="h-64"><Line v-if="invocationsChartData.labels.length" :data="invocationsChartData" :options="lineChartOptions" /><EmptyChart v-else /></div>
            </div>
            <div class="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
              <div class="mb-4 flex items-baseline justify-between gap-3"><h3 class="font-semibold">Evolução de erros</h3><span class="text-xs text-slate-500">quanto menor, melhor</span></div>
              <div class="h-64"><Line v-if="errorRateChartData.labels.length" :data="errorRateChartData" :options="errorChartOptions" /><EmptyChart v-else /></div>
            </div>
            <div class="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
              <div class="mb-4 flex items-baseline justify-between gap-3"><h3 class="font-semibold">Duração média</h3><span class="text-xs text-slate-500">por execução</span></div>
              <div class="h-64"><Bar v-if="durationChartData.labels.length" :data="durationChartData" :options="durationChartOptions" /><EmptyChart v-else /></div>
            </div>
          </section>

          <section class="grid gap-6 lg:grid-cols-3">
            <div class="rounded-lg border border-slate-200 bg-white p-4 sm:p-5 lg:col-span-2">
              <div class="mb-4 flex flex-col gap-3"><div class="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between"><div><h3 class="font-semibold">Eventos recentes</h3><p class="mt-1 text-sm text-slate-500">Logs do CloudWatch para investigação. Os filtros são exatos.</p></div><p v-if="lastLogsUpdatedAt" class="text-xs text-slate-500">Atualizado às {{ lastLogsUpdatedAt }}</p></div><div class="flex flex-col gap-2 sm:flex-row"><input v-model="logSearch" @keyup.enter="refreshLogs" type="search" placeholder="Buscar texto nos logs" class="min-h-10 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-slate-900 focus:outline-none" /><select v-model="logFilter" @change="refreshLogs" :disabled="isLogsLoading" class="min-h-10 rounded-md border border-slate-300 bg-white px-2 text-sm disabled:opacity-50"><option value="relevant">Relevantes</option><option value="error">Somente erros</option><option value="report">Somente relatórios</option><option value="all">Todos</option></select><button @click="refreshLogs" :disabled="isLogsLoading" class="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">{{ isLogsLoading ? 'Filtrando…' : 'Filtrar' }}</button><button @click="exportLogsCsv" :disabled="!logs.length || isLogsLoading" class="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">Exportar</button></div></div>
              <div id="recent-events" class="divide-y divide-slate-100 border-y border-slate-100">
                <div v-if="isLogsLoading" class="space-y-3 py-5" aria-live="polite"><div v-for="index in 4" :key="index" class="h-12 animate-pulse rounded bg-slate-100"></div><p class="text-center text-sm text-slate-500">Consultando eventos no CloudWatch…</p></div>
                <div v-else-if="logsError" class="py-10 text-center"><p class="text-sm font-medium text-red-700">Não foi possível carregar os eventos.</p><p class="mt-1 text-sm text-slate-500">{{ logsError }}</p><button @click="refreshLogs" class="mt-4 min-h-10 rounded-md border border-slate-300 px-3 text-sm font-medium">Tentar novamente</button></div>
                <div v-else-if="!logs.length" class="py-10 text-center text-sm text-slate-500">Nenhum evento corresponde a este filtro e período.</div>
                <article v-for="log in logs" :key="getLogKey(log)" class="flex gap-3 py-3">
                  <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full" :class="getLogDotClass(log)"></span>
                  <div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-x-2 gap-y-1"><span class="text-xs font-semibold uppercase tracking-wide" :class="getDisplayTextClass(log)">{{ getDisplayType(log) }}</span><span class="text-xs text-slate-400">{{ formatLogTimestamp(log.timestamp) }}</span></div><p class="mt-1 break-words font-mono text-sm text-slate-700">{{ getDisplayMessage(log) }}</p><p v-if="log.parsedReport?.durationMs" class="mt-1 text-xs text-slate-500">Duração: {{ formatDuration(log.parsedReport.durationMs) }}<span v-if="log.parsedReport.maxMemoryUsedMb"> · Memória máxima: {{ log.parsedReport.maxMemoryUsedMb }} MB</span></p></div>
                </article>
              </div>
              <div class="mt-4 flex items-center justify-between gap-3"><label class="inline-flex items-center gap-2 text-sm text-slate-600"><input v-model="simplifyLogs" type="checkbox" class="rounded border-slate-300" @change="refreshLogs" :disabled="isLogsLoading" /> Resumir mensagens técnicas</label><button v-if="canLoadMore" @click="loadMoreLogs" :disabled="isLoadingMore || isLogsLoading" class="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-medium disabled:opacity-50">{{ isLoadingMore ? 'Carregando…' : 'Carregar mais' }}</button></div>
            </div>
            <aside class="space-y-4">
              <div class="rounded-lg border border-slate-200 bg-white p-4 sm:p-5"><h3 class="font-semibold">Diagnóstico do período</h3><dl class="mt-4 space-y-3 text-sm"><div class="flex justify-between gap-3"><dt class="text-slate-500">Eventos analisados</dt><dd class="font-medium">{{ formatNumber(logSummary.total) }}</dd></div><div class="flex justify-between gap-3"><dt class="text-slate-500">Erros nos logs</dt><dd class="font-medium" :class="logSummary.errors ? 'text-red-700' : ''">{{ formatNumber(logSummary.errors) }}</dd></div><div class="flex justify-between gap-3"><dt class="text-slate-500">Duração média registrada</dt><dd class="font-medium">{{ logSummary.avgDurationMs ? formatDuration(logSummary.avgDurationMs) : '—' }}</dd></div><div class="flex justify-between gap-3"><dt class="text-slate-500">Pico simultâneo</dt><dd class="font-medium">{{ formatNumber(metrics.concurrentExecutions) }}</dd></div></dl></div>
              <div v-if="showCostEstimate && costEstimate" class="rounded-lg border border-slate-200 bg-white p-4 sm:p-5"><h3 class="font-semibold">Custo estimado</h3><p class="mt-2 text-2xl font-semibold">{{ formatCurrency(costEstimate.totalCost, costEstimate.currency) }}</p><p class="mt-1 text-sm text-slate-500">{{ costEstimate.period }}</p><p class="mt-4 text-xs text-slate-500">Estimativa baseada no uso da função e na tabela AWS para {{ costEstimate.pricingRegion || 'a região configurada' }}.</p></div>
              <button v-if="selectedIntegration?.documentationLinks?.length" @click="activeTab = 'docs'" class="w-full rounded-lg border border-slate-200 bg-white p-4 text-left text-sm font-medium hover:bg-slate-50">Abrir documentações da função <span class="float-right">→</span></button>
            </aside>
          </section>
        </template>
      </section>

      <section v-if="activeTab === 'docs'" class="space-y-6">
        <div class="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between"><label class="block w-full sm:max-w-md"><span class="mb-1.5 block text-sm font-medium">Função Lambda</span><select v-model="selectedIntegrationId" class="block min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"><option value="">Selecione uma função</option><option v-for="integration in integrations" :key="integration.id" :value="String(integration.id)">{{ integration.name }} · {{ integration.functionName }}</option></select></label><button v-if="selectedIntegrationId" @click="activeTab = 'dashboard'" class="min-h-11 rounded-md border border-slate-300 px-3 text-sm font-medium">Voltar ao Dashboard</button></div>
        <div v-if="!selectedIntegrationId" class="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center"><h3 class="font-semibold">Selecione uma função</h3><p class="mt-1 text-sm text-slate-500">A documentação disponível aparecerá aqui.</p></div>
        <template v-else>
          <section>
            <div class="mb-4"><h3 class="font-semibold text-slate-950">Mapeamento de dados</h3><p class="mt-1 text-sm text-slate-500">Consulte o de-para publicado, regras de transformação, obrigatoriedade e valores padrão.</p></div>
            <MappingWorkspace :integration-id="Number(selectedIntegrationId)" />
          </section>
          <section class="border-t border-slate-200 pt-6">
            <div class="mb-4"><h3 class="font-semibold text-slate-950">Materiais de apoio</h3><p class="mt-1 text-sm text-slate-500">Guias, especificações e documentos vinculados à automação.</p></div>
            <div v-if="!selectedIntegration?.documentationLinks?.length" class="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center"><h4 class="font-semibold">Sem materiais vinculados</h4><p class="mt-1 text-sm text-slate-500">Ainda não há links adicionais para esta função.</p></div>
            <div v-else class="grid gap-4 md:grid-cols-2"><article v-for="(link, index) in selectedIntegration.documentationLinks" :key="link" class="rounded-lg border border-slate-200 bg-white p-5"><p class="text-sm font-medium">Documentação {{ index + 1 }}</p><p class="mt-2 break-all text-sm text-slate-500">{{ link }}</p><div class="mt-5 flex gap-2"><a :href="link" target="_blank" rel="noopener noreferrer" class="inline-flex min-h-10 items-center rounded-md bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-700">Abrir em nova aba</a><button @click="fullscreenDocLink = link" class="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-medium">Visualizar</button></div></article></div>
          </section>
        </template>
      </section>
    </main>

    <div v-if="fullscreenDocLink" class="fixed inset-0 z-50 flex flex-col bg-white"><div class="flex min-h-14 items-center justify-between border-b border-slate-200 px-4"><p class="truncate text-sm font-medium">Visualização da documentação</p><div class="flex gap-2"><a :href="fullscreenDocLink" target="_blank" rel="noopener noreferrer" class="rounded-md border border-slate-300 px-3 py-2 text-sm">Abrir</a><button @click="fullscreenDocLink = null" class="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white">Fechar</button></div></div><iframe :src="fullscreenDocLink" title="Documentação" class="min-h-0 flex-1" sandbox="allow-same-origin allow-scripts allow-forms allow-popups" referrerpolicy="no-referrer"></iframe></div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { useApi } from '@/composables/useApi'
import type { CostEstimate, Integration, LogEntry, LogSummary, MetricDataResult, Metrics, MetricsResponse, LogsResponse } from '@/types'
import logoDark from '@/assets/logos/logo-dark.svg'
import ProcessPortal from '@/components/ProcessPortal.vue'
import MappingWorkspace from '@/components/MappingWorkspace.vue'
import { Bar, Line } from 'vue-chartjs'
import { BarElement, CategoryScale, Chart as ChartJS, Filler, Legend, LineElement, LinearScale, PointElement, Title, Tooltip } from 'chart.js'
import type { TooltipItem } from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler)

const EmptyChart = defineComponent({ setup: () => () => h('div', { class: 'flex h-full items-center justify-center text-sm text-slate-500' }, 'Sem dados para este período.') })
const auth = useAuthStore()
const router = useRouter()
const api = useApi()
const activeTab = ref<'overview' | 'queue' | 'dashboard' | 'docs'>('overview')
const portalTabs = [{ value: 'overview' as const, label: 'Visão geral' }, { value: 'queue' as const, label: 'Fila e entregas' }, { value: 'dashboard' as const, label: 'Dashboard' }, { value: 'docs' as const, label: 'Documentações' }]
const integrations = ref<Integration[]>([])
const selectedIntegrationId = ref('')
const timePeriod = ref(localStorage.getItem('lambda-pulse-period') || '7')
const logFilter = ref('relevant')
const logSearch = ref('')
const simplifyLogs = ref(false)
const isLoading = ref(false)
const isLogsLoading = ref(false)
const isLoadingMore = ref(false)
const logsError = ref('')
const metricsError = ref('')
const fullscreenDocLink = ref<string | null>(null)
const metrics = ref<Metrics>({ invocations: 0, errors: 0, duration: 0, errorRate: 0, throttles: 0, concurrentExecutions: 0 })
const logs = ref<LogEntry[]>([])
const logSummary = ref<LogSummary>({ total: 0, reports: 0, errors: 0, avgDurationMs: null })
const rawMetricsData = ref<MetricDataResult[]>([])
const costEstimate = ref<CostEstimate | null>(null)
const nextBefore = ref<number | null>(null)
const lastLogsUpdatedAt = ref('')
let activeLogsRequest = 0

const selectedIntegration = computed(() => integrations.value.find(item => String(item.id) === selectedIntegrationId.value))
const showCostEstimate = computed(() => selectedIntegration.value?.showCostEstimate !== false)
const canLoadMore = computed(() => Boolean(nextBefore.value))
const periodLabel = computed(() => ({ '1': '24 horas', '7': '7 dias', '14': '14 dias', '30': '30 dias' })[timePeriod.value] || 'período selecionado')
const pageTitle = computed(() => ({ overview: 'Visão geral', queue: 'Fila e entregas', dashboard: 'Dashboard', docs: 'Documentações' })[activeTab.value])
const pageDescription = computed(() => ({ overview: 'Acompanhe prioridades, progresso e próximos passos.', queue: 'Visibilidade completa das demandas da sua empresa.', dashboard: 'Encontre erros, entenda o impacto e acompanhe sua automação em um só lugar.', docs: 'Acesse os materiais técnicos das suas automações.' })[activeTab.value])
const integrationUnavailable = computed(() => selectedIntegration.value?.lastCheckStatus === 'unavailable')
const healthLabel = computed(() => metricsError.value || integrationUnavailable.value ? 'Monitoramento indisponível' : metrics.value.errors > 0 ? 'Atenção necessária' : metrics.value.throttles > 0 ? 'Há limitações de capacidade' : 'Operação estável')
const healthDescription = computed(() => metricsError.value || integrationUnavailable.value ? (metricsError.value || selectedIntegration.value?.lastCheckMessage || 'Não foi possível consultar a AWS agora.') : metrics.value.errors > 0 ? `${formatNumber(metrics.value.errors)} erro(s) foram identificados. Consulte os eventos recentes para investigar.` : metrics.value.throttles > 0 ? `${formatNumber(metrics.value.throttles)} execução(ões) encontrou(ram) limite de concorrência.` : 'Não identificamos erros ou limitações no período selecionado.')
const healthTone = computed(() => metricsError.value || integrationUnavailable.value ? { container: 'border-red-200 bg-red-50', dot: 'bg-red-600', text: 'text-red-800' } : metrics.value.errors > 0 ? { container: 'border-red-200 bg-red-50', dot: 'bg-red-600', text: 'text-red-800' } : metrics.value.throttles > 0 ? { container: 'border-amber-200 bg-amber-50', dot: 'bg-amber-500', text: 'text-amber-800' } : { container: 'border-emerald-200 bg-emerald-50', dot: 'bg-emerald-600', text: 'text-emerald-800' })

watch(timePeriod, value => localStorage.setItem('lambda-pulse-period', value))
watch(activeTab, async tab => { if ((tab === 'dashboard' || tab === 'docs') && selectedIntegrationId.value && tab === 'dashboard') await loadData() })

type MetricBucket = { timestamp: number; sum: number; count: number }

const chartBucketTimestamp = (timestamp: string) => {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return 0
  return timePeriod.value === '1'
    ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()).getTime()
    : new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

const metricBuckets = (metricId: string) => {
  const metric = rawMetricsData.value.find(item => item.Id === metricId)
  const buckets = new Map<number, MetricBucket>()
  metric?.Timestamps?.forEach((timestamp, index) => {
    const bucketTimestamp = chartBucketTimestamp(timestamp)
    if (!bucketTimestamp) return
    const bucket = buckets.get(bucketTimestamp) || { timestamp: bucketTimestamp, sum: 0, count: 0 }
    bucket.sum += metric.Values?.[index] || 0
    bucket.count += 1
    buckets.set(bucketTimestamp, bucket)
  })
  return [...buckets.values()].sort((left, right) => left.timestamp - right.timestamp)
}

const formatChartLabel = (timestamp: number) => new Intl.DateTimeFormat('pt-BR', timePeriod.value === '1'
  ? { hour: '2-digit', minute: '2-digit' }
  : { day: '2-digit', month: '2-digit' }).format(new Date(timestamp))

const lineDataset = (values: number[], color: string) => ({ data: values, borderColor: color, backgroundColor: `${color}18`, fill: true, tension: 0.3, borderWidth: 2, pointRadius: 2, pointHoverRadius: 5 })
const invocationsChartData = computed(() => { const buckets = metricBuckets('invocations'); return { labels: buckets.map(item => formatChartLabel(item.timestamp)), datasets: [lineDataset(buckets.map(item => item.sum), '#2563eb')] } })
const errorRateChartData = computed(() => { const calls = metricBuckets('invocations'); const errors = new Map(metricBuckets('errors').map(item => [item.timestamp, item.sum])); return { labels: calls.map(item => formatChartLabel(item.timestamp)), datasets: [lineDataset(calls.map(item => item.sum ? ((errors.get(item.timestamp) || 0) / item.sum) * 100 : 0), '#dc2626')] } })
const durationChartData = computed(() => { const duration = new Map(metricBuckets('durationSum').map(item => [item.timestamp, item.sum])); const samples = metricBuckets('durationSampleCount'); return { labels: samples.map(item => formatChartLabel(item.timestamp)), datasets: [{ data: samples.map(item => item.sum ? (duration.get(item.timestamp) || 0) / item.sum : 0), backgroundColor: '#7c3aed', borderRadius: 4, maxBarThickness: 28 }] } })
const commonChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  onHover: (_event: unknown, elements: unknown[], chart: { canvas: { style: { cursor: string } } }) => { chart.canvas.style.cursor = elements.length ? 'pointer' : 'default' },
  plugins: { legend: { display: false }, tooltip: { enabled: true, displayColors: false, padding: 10, backgroundColor: '#0f172a', titleColor: '#ffffff', bodyColor: '#ffffff' } },
  scales: { y: { beginAtZero: true, grid: { color: '#e2e8f0' }, ticks: { color: '#64748b' } }, x: { grid: { display: false }, ticks: { color: '#64748b', maxRotation: 0, autoSkip: true } } }
}
const lineChartOptions = { ...commonChartOptions, plugins: { ...commonChartOptions.plugins, tooltip: { ...commonChartOptions.plugins.tooltip, callbacks: { label: (context: TooltipItem<'line'>) => ` ${formatNumber(context.parsed.y || 0)} invocações` } } } }
const errorChartOptions = { ...commonChartOptions, scales: { ...commonChartOptions.scales, y: { ...commonChartOptions.scales.y, max: 100, ticks: { color: '#64748b', callback: (value: string | number) => `${value}%` } } }, plugins: { ...commonChartOptions.plugins, tooltip: { ...commonChartOptions.plugins.tooltip, callbacks: { label: (context: TooltipItem<'line'>) => ` ${(context.parsed.y || 0).toFixed(2)}% de erros` } } } }
const durationChartOptions = { ...commonChartOptions, plugins: { ...commonChartOptions.plugins, tooltip: { ...commonChartOptions.plugins.tooltip, callbacks: { label: (context: TooltipItem<'bar'>) => ` ${formatDuration(context.parsed.y || 0)}` } } } }

async function fetchIntegrations() { try { const data = await api.get<{ integrations: Integration[] }>('/lambda/integrations'); integrations.value = data.integrations; if (!selectedIntegrationId.value && data.integrations[0]) selectedIntegrationId.value = String(data.integrations[0].id) } catch (error) { console.error('Falha ao buscar integrações:', error) } }
async function loadData() { if (!selectedIntegrationId.value) return; isLoading.value = true; try { await Promise.all([loadMetrics(), loadLogs()]) } finally { isLoading.value = false } }
async function loadMetrics() { metricsError.value = ''; try { const period = timePeriod.value === '1' ? 300 : 3600; const data = await api.get<MetricsResponse>(`/lambda/metrics/${selectedIntegrationId.value}?days=${timePeriod.value}&period=${period}`); rawMetricsData.value = data.metrics; const sum = (id: string) => data.metrics.find(item => item.Id === id)?.Values?.reduce((total, value) => total + value, 0) || 0; const invocations = sum('invocations'); const errors = sum('errors'); const durationSamples = sum('durationSampleCount'); metrics.value = { invocations, errors, duration: durationSamples ? sum('durationSum') / durationSamples : 0, errorRate: invocations ? errors / invocations * 100 : 0, throttles: sum('throttles'), concurrentExecutions: Math.max(0, ...(data.metrics.find(item => item.Id === 'concurrentExecutions')?.Values || [])) }; costEstimate.value = data.costEstimate } catch (error) { metricsError.value = error instanceof Error ? error.message : 'Falha ao consultar as métricas da AWS.'; rawMetricsData.value = []; metrics.value = { invocations: 0, errors: 0, duration: 0, errorRate: 0, throttles: 0, concurrentExecutions: 0 }; costEstimate.value = null } }
async function loadLogs(append = false) { if (!selectedIntegrationId.value) return; const requestId = ++activeLogsRequest; if (!append) { isLogsLoading.value = true; logsError.value = ''; logs.value = []; nextBefore.value = null } else { isLoadingMore.value = true }; try { const endTime = Date.now(); const startTime = endTime - Number(timePeriod.value) * 86400000; const params = new URLSearchParams({ type: logFilter.value, startTime: String(startTime), endTime: String(endTime), limit: '20', simplify: simplifyLogs.value ? '1' : '0', summary: '1', summaryScope: 'page' }); if (logSearch.value.trim()) params.set('search', logSearch.value.trim()); if (append && nextBefore.value) params.set('before', String(nextBefore.value)); const data = await api.get<LogsResponse>(`/lambda/logs/${selectedIntegrationId.value}?${params}`); if (requestId !== activeLogsRequest) return; logs.value = append ? mergeLogs(logs.value, data.logs) : data.logs; logSummary.value = data.summary; nextBefore.value = data.nextBefore ?? null; lastLogsUpdatedAt.value = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date()) } catch (error) { if (requestId === activeLogsRequest) { if (!append) logsError.value = error instanceof Error ? error.message : 'Erro inesperado ao consultar o CloudWatch.'; console.error('Falha ao carregar logs:', error) } } finally { if (requestId === activeLogsRequest) { isLogsLoading.value = false; isLoadingMore.value = false } } }
function refreshData() { void loadData() }
function refreshLogs() { void loadLogs() }
function loadMoreLogs() { void loadLogs(true) }
function openDashboard(id: number) { selectedIntegrationId.value = String(id); activeTab.value = 'dashboard' }
function openMapping(id: number) { selectedIntegrationId.value = String(id); activeTab.value = 'docs' }
function focusErrors() { logFilter.value = 'errors'; void loadLogs(); document.getElementById('recent-events')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
function formatNumber(value: number) { return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, notation: value >= 10000 ? 'compact' : 'standard' }).format(value) }
function formatDuration(value: number) { return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms` }
function formatCurrency(value: number, currency: string) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 4 }).format(value) }
function formatLogTimestamp(timestamp?: number | null) { return timestamp ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp)) : '—' }
function getLogType(log: LogEntry) { if (log.level === 'error' || /error|exception|fail/i.test(log.message)) return 'Erro'; if (log.level === 'warn') return 'Alerta'; if (/report/i.test(log.message)) return 'Relatório'; return 'Info' }
function getDisplayType(log: LogEntry) { return simplifyLogs.value && log.category ? log.category : getLogType(log) }
function getDisplayMessage(log: LogEntry) { return simplifyLogs.value && log.simplifiedMessage ? log.simplifiedMessage : log.message }
function getLogDotClass(log: LogEntry) { return getLogType(log) === 'Erro' ? 'bg-red-600' : getLogType(log) === 'Alerta' ? 'bg-amber-500' : 'bg-slate-400' }
function getDisplayTextClass(log: LogEntry) { return getLogType(log) === 'Erro' ? 'text-red-700' : getLogType(log) === 'Alerta' ? 'text-amber-700' : 'text-slate-500' }
function getLogKey(log: LogEntry) { return log.eventId ? `id:${log.eventId}` : `${log.timestamp}-${log.message}` }
function mergeLogs(current: LogEntry[], incoming: LogEntry[]) { const values = new Map(current.map(log => [getLogKey(log), log])); incoming.forEach(log => values.set(getLogKey(log), log)); return [...values.values()].sort((a, b) => b.timestamp - a.timestamp) }
function exportLogsCsv() { if (!logs.value.length) return; const rows = [['Data/Hora', 'Tipo', 'Mensagem', 'Duração (ms)'], ...logs.value.map(log => [formatLogTimestamp(log.timestamp), getDisplayType(log), getDisplayMessage(log), String(log.parsedReport?.durationMs || '')])]; const csv = '\uFEFF' + rows.map(row => row.map(value => `"${value.replace(/"/g, '""')}"`).join(',')).join('\r\n'); const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `logs-${selectedIntegration.value?.functionName || 'lambda'}.csv`; link.click(); URL.revokeObjectURL(url) }
async function handleLogout() { await auth.logout(); await router.push('/login') }
onMounted(async () => { if (!auth.isAuthenticated || !auth.isClient) { await router.push('/login'); return }; await fetchIntegrations() })
</script>
