<template>
  <div class="min-h-screen bg-slate-50 flex flex-col">
    <!-- Navigation -->
    <nav class="bg-white shadow-sm border-b border-slate-200">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between h-16">
          <div class="flex items-center space-x-3">
            <img :src="logoDark" alt="Logo da empresa" class="h-8 w-auto" />
            <div>
              <h1 class="text-lg font-semibold text-slate-900">Lambda Pulse</h1>
              <p class="text-xs text-slate-500">{{ auth.user?.companyName }}</p>
            </div>
          </div>
          <div class="flex items-center space-x-4">
            <div class="text-right">
              <p class="text-sm font-medium text-slate-900">{{ auth.user?.email }}</p>
            </div>
            <button
              @click="handleLogout"
              class="inline-flex items-center px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sair
            </button>
          </div>
        </div>
      </div>
    </nav>

    <main class="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 flex-1 w-full">
      <!-- Header -->
      <div class="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 class="text-2xl font-bold text-slate-900">Painel</h2>
          <p class="mt-1 text-sm text-slate-600">
            Acompanhe o desempenho das suas funções Lambda
          </p>
        </div>
        <div class="mt-2 flex flex-wrap items-center gap-4">
          <label class="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">
            <span>Cards & Dashboards</span>
            <span class="relative inline-flex h-6 w-11 items-center">
              <input v-model="showCards" type="checkbox" class="peer sr-only" />
              <span class="absolute inset-0 rounded-full bg-slate-200 transition peer-checked:bg-indigo-600"></span>
              <span class="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"></span>
            </span>
          </label>
          <label class="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">
            <span>Documentações</span>
            <span class="relative inline-flex h-6 w-11 items-center">
              <input v-model="showDocs" type="checkbox" class="peer sr-only" />
              <span class="absolute inset-0 rounded-full bg-slate-200 transition peer-checked:bg-indigo-600"></span>
              <span class="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"></span>
            </span>
          </label>
          <label class="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">
            <span>Logs Recentes</span>
            <span class="relative inline-flex h-6 w-11 items-center">
              <input v-model="showLogs" type="checkbox" class="peer sr-only" />
              <span class="absolute inset-0 rounded-full bg-slate-200 transition peer-checked:bg-indigo-600"></span>
              <span class="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"></span>
            </span>
          </label>
        </div>
      </div>

      <!-- Function Selector & Time Range -->
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-8">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label for="integration" class="block text-sm font-medium text-slate-700 mb-2">Função Lambda</label>
            <select
              v-model="selectedIntegrationId"
              @change="loadData"
              class="block w-full px-4 py-2.5 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
            >
              <option value="">Selecione uma função...</option>
              <option v-for="integration in integrations" :key="integration.id" :value="integration.id">
                {{ integration.name }} ({{ integration.functionName }})
              </option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Período</label>
            <select
              v-model="timePeriod"
              @change="loadData"
              class="block w-full px-4 py-2.5 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
            >
              <option value="1">Últimas 24 horas</option>
              <option value="7">Últimos 7 dias</option>
              <option value="14">Últimos 14 dias</option>
              <option value="30">Últimos 30 dias</option>
            </select>
          </div>
          <div class="flex items-end">
            <button
              @click="refreshData"
              :disabled="!selectedIntegrationId || isLoading"
              class="w-full inline-flex justify-center items-center px-4 py-2.5 border border-transparent rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg v-if="isLoading" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <svg v-else class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Atualizar
            </button>
          </div>
        </div>
      </div>

      <div v-if="selectedIntegrationId" class="space-y-8">
        <!-- Metrics Cards -->
        <div v-if="showCards" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <!-- Invocations Card -->
          <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <div class="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
              </div>
              <div class="ml-4 flex-1">
                <p class="text-sm font-medium text-slate-500">Total de invocações</p>
                <p class="text-2xl font-bold text-slate-900">{{ formatNumber(metrics.invocations) }}</p>
              </div>
            </div>
          </div>

          <!-- Error Rate Card -->
          <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <div class="w-12 h-12 rounded-xl flex items-center justify-center" :class="metrics.errorRate > 5 ? 'bg-red-100' : 'bg-green-100'">
                  <svg class="w-6 h-6" :class="metrics.errorRate > 5 ? 'text-red-600' : 'text-green-600'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
              </div>
              <div class="ml-4 flex-1">
                <p class="text-sm font-medium text-slate-500">Taxa de erro</p>
                <p class="text-2xl font-bold" :class="metrics.errorRate > 5 ? 'text-red-600' : 'text-slate-900'">
                  {{ metrics.errorRate.toFixed(2) }}%
                </p>
                <p class="text-xs text-slate-400">{{ metrics.errors }} erros</p>
              </div>
            </div>
          </div>

          <!-- Average Duration Card -->
          <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <div class="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                  <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <div class="ml-4 flex-1">
                <p class="text-sm font-medium text-slate-500">Duração média</p>
                <p class="text-2xl font-bold text-slate-900">{{ formatDuration(metrics.duration) }}</p>
              </div>
            </div>
          </div>

          <!-- Estimated Cost Card -->
          <div v-if="showCostEstimate" class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <div class="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <svg class="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <div class="ml-4 flex-1">
                <p class="text-sm font-medium text-slate-500">Custo estimado</p>
                <p class="text-2xl font-bold text-slate-900">${{ costEstimate.totalCost.toFixed(4) }}</p>
                <p class="text-xs text-slate-400">{{ costEstimate.period }}</p>
                <p v-if="costEstimate.pricingRegion" class="text-xs text-slate-400">
                  Preço base: {{ costEstimate.pricingRegion }}
                  <span v-if="costEstimate.pricingSource === 'fallback'">(fallback)</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Charts Row -->
        <div v-if="showCards" class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <!-- Invocations Chart -->
          <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 class="text-lg font-semibold text-slate-900 mb-4">Invocações ao longo do tempo</h3>
            <div class="h-64">
              <Line v-if="invocationsChartData.labels.length > 0" :data="invocationsChartData" :options="lineChartOptions" />
              <div v-else class="h-full flex items-center justify-center text-slate-400">
                Sem dados
              </div>
            </div>
          </div>

          <!-- Error Rate Chart -->
          <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 class="text-lg font-semibold text-slate-900 mb-4">Taxa de erro ao longo do tempo</h3>
            <div class="h-64">
              <Line v-if="errorRateChartData.labels.length > 0" :data="errorRateChartData" :options="errorChartOptions" />
              <div v-else class="h-full flex items-center justify-center text-slate-400">
                Sem dados
              </div>
            </div>
          </div>
        </div>

        <!-- Duration Chart -->
        <div v-if="showCards" class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 class="text-lg font-semibold text-slate-900 mb-4">Duração média ao longo do tempo</h3>
          <div class="h-64">
            <Bar v-if="durationChartData.labels.length > 0" :data="durationChartData" :options="barChartOptions" />
            <div v-else class="h-full flex items-center justify-center text-slate-400">
              Sem dados
            </div>
          </div>
        </div>

        <!-- Cost Breakdown -->
        <div v-if="showCards && showCostEstimate" class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 class="text-lg font-semibold text-slate-900 mb-4">Detalhamento de custos</h3>
          <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div class="bg-slate-50 rounded-lg p-4">
              <p class="text-sm text-slate-500">Total de invocações</p>
              <p class="text-xl font-semibold text-slate-900">{{ formatNumber(costEstimate.totalInvocations) }}</p>
            </div>
            <div class="bg-slate-50 rounded-lg p-4">
              <p class="text-sm text-slate-500">GB-segundos</p>
              <p class="text-xl font-semibold text-slate-900">{{ costEstimate.totalGBSeconds.toFixed(2) }}</p>
            </div>
            <div class="bg-slate-50 rounded-lg p-4">
              <p class="text-sm text-slate-500">Custo por requisição</p>
              <p class="text-xl font-semibold text-slate-900">${{ costEstimate.requestCost.toFixed(6) }}</p>
            </div>
            <div class="bg-slate-50 rounded-lg p-4">
              <p class="text-sm text-slate-500">Custo de computação</p>
              <p class="text-xl font-semibold text-slate-900">${{ costEstimate.computeCost.toFixed(6) }}</p>
            </div>
          </div>
          <p class="mt-4 text-xs text-slate-400">
            * Os custos são estimados com base nos preços do AWS Lambda ({{ costEstimate.pricingRegion || 'us-east-2' }}):
            $0.20/1M requisições + $0.0000166667/GB-segundo.
            Os valores reais podem variar conforme a região e alterações nos preços da AWS.
          </p>
        </div>

        <!-- Documentation Links -->
        <div v-if="showDocs && selectedIntegration?.documentationLinks?.length" class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 class="text-lg font-semibold text-slate-900 mb-4">Documentações</h3>
          <div class="space-y-4">
            <div v-for="(link, index) in selectedIntegration.documentationLinks" :key="`doc-${index}`" class="space-y-2">
              <div class="relative w-full h-40 rounded-lg border border-slate-200 bg-slate-100 overflow-hidden">
                <iframe
                  :src="link"
                  class="w-full h-full pointer-events-none"
                  loading="lazy"
                  referrerpolicy="no-referrer"
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                  title="Documentação"
                ></iframe>
                <div
                  class="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-[1px]"
                >
                  <button
                    type="button"
                    @click="openDocFullscreen(link)"
                    class="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
                  >
                    Expandir
                  </button>
                </div>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  @click="openDocFullscreen(link)"
                  class="inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800"
                >
                  Tela cheia
                </button>
                <a
                  :href="link"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  Abrir em nova aba
                </a>
              </div>
            </div>
          </div>
        </div>

        <!-- Logs Section -->
        <div v-if="showLogs" class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div class="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold text-slate-900">Logs recentes</h3>
              <div class="flex items-center space-x-4">
                <label class="inline-flex items-center text-xs text-slate-600 space-x-2">
                  <input
                    v-model="simplifyLogs"
                    type="checkbox"
                    class="h-4 w-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                    @change="loadLogs"
                  />
                  <span>Simplificar</span>
                </label>
                <button
                  type="button"
                  @click="toggleSummary"
                  class="inline-flex items-center px-3 py-1.5 text-xs border border-slate-300 rounded-lg text-slate-600 bg-white hover:bg-slate-50"
                >
                  {{ showSummary ? 'Ocultar resumo' : 'Resumo' }}
                </button>
                <button
                  type="button"
                  @click="handleAiSummaryAction"
                  :disabled="!selectedIntegrationId || aiSummaryStatus === 'running'"
                  class="inline-flex items-center px-3 py-1.5 text-xs border border-indigo-200 rounded-lg text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {{ aiSummaryButtonLabel }}
                </button>
                <select
                  v-model="logFilter"
                  @change="loadLogs"
                  class="px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="relevant">Relevantes</option>
                  <option value="error">Somente erros</option>
                  <option value="report">Somente relatórios</option>
                  <option value="all">Todos os logs</option>
                </select>
                <div class="text-sm text-slate-500">
                  <span class="font-medium">{{ logSummary.total }}</span> logs
                  <span class="mx-1">•</span>
                  <span class="text-red-600 font-medium">{{ logSummary.errors }}</span> erros
                  <span class="mx-1">•</span>
                  Média <span class="font-medium">{{ logSummary.avgDurationMs ? Math.round(logSummary.avgDurationMs) : 0 }}</span> ms
                </div>
              </div>
            </div>
          </div>
          <div v-if="showSummary" class="px-6 py-4 border-b border-slate-200 bg-white">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-slate-600">
              <div class="bg-slate-50 rounded-lg p-3">
                <p class="text-xs text-slate-500">Período analisado</p>
                <p class="font-medium text-slate-700">
                  {{ logSummary.startTime ? new Date(logSummary.startTime).toLocaleString() : '-' }}
                  →
                  {{ logSummary.endTime ? new Date(logSummary.endTime).toLocaleString() : '-' }}
                </p>
              </div>
              <div class="bg-slate-50 rounded-lg p-3">
                <p class="text-xs text-slate-500">Erros e timeouts</p>
                <p class="font-medium text-slate-700">
                  {{ logSummary.errors }} erro(s)
                  <span class="mx-1">•</span>
                  {{ logSummary.timeouts ?? 0 }} timeout(s)
                </p>
              </div>
              <div class="bg-slate-50 rounded-lg p-3">
                <p class="text-xs text-slate-500">Duração média</p>
                <p class="font-medium text-slate-700">
                  {{ logSummary.avgDurationMs ? Math.round(logSummary.avgDurationMs) : 0 }} ms
                </p>
              </div>
            </div>
            <div v-if="logSummary.topMessages?.length" class="mt-4">
              <h4 class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Principais eventos</h4>
              <ul class="mt-2 space-y-2">
                <li v-for="item in logSummary.topMessages" :key="item.message" class="text-sm text-slate-700">
                  <span class="font-semibold">{{ item.count }}x</span> — {{ item.message }}
                </li>
              </ul>
            </div>
          </div>
          <div class="max-h-96 overflow-y-auto">
            <ul class="divide-y divide-slate-100">
              <li v-for="log in logs" :key="log.timestamp" class="px-6 py-4 hover:bg-slate-50 transition-colors">
                <div class="flex items-start space-x-3">
                  <span
                      :class="getDisplayTypeClass(log)"
                    class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-0.5"
                  >
                      {{ getDisplayType(log) }}
                  </span>
                  <div class="flex-1 min-w-0">
                      <p class="text-sm text-slate-900 font-mono break-all">{{ getDisplayMessage(log) }}</p>
                    <div class="mt-1 flex items-center space-x-4 text-xs text-slate-500">
                      <span>{{ new Date(log.timestamp).toLocaleString() }}</span>
                      <template v-if="log.parsedReport">
                        <span class="flex items-center">
                          <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {{ log.parsedReport.durationMs ?? '-' }} ms
                        </span>
                        <span class="flex items-center">
                          <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                          Cobrado {{ log.parsedReport.billedDurationMs ?? '-' }} ms
                        </span>
                        <span class="flex items-center">
                          <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                          </svg>
                          {{ log.parsedReport.maxMemoryUsedMb ?? '-' }} MB
                        </span>
                      </template>
                    </div>
                  </div>
                </div>
              </li>
              <li v-if="logs.length === 0" class="px-6 py-8 text-center text-slate-500">
                Nenhum log encontrado para o período selecionado
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
        <svg class="mx-auto h-12 w-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <h3 class="mt-4 text-lg font-medium text-slate-900">Selecione uma função Lambda</h3>
        <p class="mt-2 text-sm text-slate-500">
          Escolha uma função Lambda no seletor acima para ver métricas e logs.
        </p>
      </div>
    </main>

    <footer class="py-6 text-center text-xs text-slate-500">
      Copyright {{ new Date().getFullYear() }} ©
      <a
        href="https://chavemestragestao.com.br/"
        target="_blank"
        rel="noopener noreferrer"
        class="font-medium text-slate-600 hover:text-slate-800"
      >
        Chave Mestra Gestão
      </a>
    </footer>

    <!-- AI Summary Modal -->
    <transition name="fade">
      <div v-if="aiSummaryModalOpen" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-slate-900/70" @click="closeAiSummaryModal"></div>
        <div class="relative w-[92vw] max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[85vh]">
          <div class="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
            <div>
              <h4 class="text-sm font-semibold text-slate-900">Resumo inteligente (Copilot)</h4>
              <p v-if="aiSummaryModel" class="text-xs text-slate-500">Modelo: {{ aiSummaryModel }}</p>
            </div>
            <button
              type="button"
              @click="closeAiSummaryModal"
              class="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-100"
            >
              Fechar
            </button>
          </div>
          <div class="px-5 py-4 overflow-y-auto max-h-[70vh]">
            <div v-if="aiSummary" class="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 whitespace-pre-wrap">
              {{ aiSummary }}
            </div>
            <div v-else class="text-sm text-slate-500">
              Resumo ainda não disponível.
            </div>
            <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p v-if="aiSummaryGeneratedAt" class="text-xs text-slate-400">
                Gerado em {{ new Date(aiSummaryGeneratedAt).toLocaleString() }}
              </p>
              <button
                type="button"
                @click="clearAiSummary"
                class="inline-flex items-center px-3 py-2 rounded-lg text-xs font-semibold border border-red-200 text-red-600 bg-red-50 hover:bg-red-100"
              >
                Limpar resumo
              </button>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- Documentation Fullscreen Modal -->
    <transition name="fade">
      <div v-if="fullscreenDocLink" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-slate-900/70" @click="closeDocFullscreen"></div>
        <div class="relative w-[96vw] h-[92vh] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
          <div class="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
            <span class="text-sm font-semibold text-slate-700">Documentação</span>
            <div class="flex items-center gap-2">
              <a
                :href="fullscreenDocLink"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Abrir em nova aba
              </a>
              <button
                type="button"
                @click="closeDocFullscreen"
                class="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-100"
              >
                Fechar
              </button>
            </div>
          </div>
          <iframe
            :src="fullscreenDocLink"
            class="w-full h-[calc(92vh-48px)]"
            loading="lazy"
            referrerpolicy="no-referrer"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            title="Documentação em tela cheia"
          ></iframe>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { useApi } from '@/composables/useApi'
import type { Integration, LogEntry, Metrics, MetricDataResult, LogSummary, CostEstimate } from '@/types'
import logoDark from '@/assets/logos/logo-dark.svg'
import { Line, Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

const auth = useAuthStore()
const router = useRouter()
const api = useApi()

const integrations = ref<Integration[]>([])
const selectedIntegrationId = ref('')
const timePeriod = ref('7')
const logFilter = ref('relevant')
const isLoading = ref(false)
const simplifyLogs = ref(false)
const showSummary = ref(false)
const showCards = ref(true)
const showDocs = ref(true)
const showLogs = ref(true)

const selectedIntegration = computed(() =>
  integrations.value.find(integration => String(integration.id) === String(selectedIntegrationId.value))
)

const showCostEstimate = computed(() => selectedIntegration.value?.showCostEstimate !== false)

const metrics = ref<Metrics>({
  invocations: 0,
  errors: 0,
  duration: 0,
  errorRate: 0,
  throttles: 0,
  concurrentExecutions: 0
})

const logs = ref<LogEntry[]>([])
const logSummary = ref<LogSummary>({ total: 0, reports: 0, errors: 0, avgDurationMs: null })
const aiSummary = ref<string | null>(null)
const aiSummaryModel = ref<string | null>(null)
const aiSummaryStatus = ref<'idle' | 'running' | 'complete' | 'error'>('idle')
const aiSummaryRequestedAt = ref<number | null>(null)
const aiSummaryGeneratedAt = ref<number | null>(null)
const aiSummaryModalOpen = ref(false)
const aiSummaryError = ref<string | null>(null)
const aiSummaryStartTime = ref<number | null>(null)
let aiSummaryPollTimeout: ReturnType<typeof setTimeout> | null = null
const aiSummaryStoragePrefix = 'ai-summary'

const costEstimate = ref<CostEstimate>({
  totalInvocations: 0,
  totalGBSeconds: 0,
  requestCost: 0,
  computeCost: 0,
  totalCost: 0,
  currency: 'USD',
  period: 'Últimos 7 dias',
  pricingRegion: 'us-east-2',
  pricingSource: 'fallback'
})

const rawMetricsData = ref<MetricDataResult[]>([])
const fullscreenDocLink = ref<string | null>(null)

// Chart data
const invocationsChartData = computed(() => {
  const invocationsMetric = rawMetricsData.value.find(m => m.Id === 'invocations')
  if (!invocationsMetric?.Timestamps?.length) {
    return { labels: [], datasets: [] }
  }

  const sortedData = invocationsMetric.Timestamps
    .map((ts, i) => ({ timestamp: new Date(ts), value: invocationsMetric.Values?.[i] || 0 }))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

  return {
    labels: sortedData.map(d => d.timestamp.toLocaleDateString()),
    datasets: [{
      label: 'Invocações',
      data: sortedData.map(d => d.value),
      borderColor: 'rgb(59, 130, 246)',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      fill: true,
      tension: 0.4
    }]
  }
})

const errorRateChartData = computed(() => {
  const invocationsMetric = rawMetricsData.value.find(m => m.Id === 'invocations')
  const errorsMetric = rawMetricsData.value.find(m => m.Id === 'errors')

  if (!invocationsMetric?.Timestamps?.length) {
    return { labels: [], datasets: [] }
  }

  const sortedData = invocationsMetric.Timestamps
    .map((ts, i) => {
      const invocations = invocationsMetric.Values?.[i] || 0
      const errors = errorsMetric?.Values?.[i] || 0
      return {
        timestamp: new Date(ts),
        rate: invocations > 0 ? (errors / invocations) * 100 : 0
      }
    })
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

  return {
    labels: sortedData.map(d => d.timestamp.toLocaleDateString()),
    datasets: [{
      label: 'Taxa de erro (%)',
      data: sortedData.map(d => d.rate),
      borderColor: 'rgb(239, 68, 68)',
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      fill: true,
      tension: 0.4
    }]
  }
})

const durationChartData = computed(() => {
  const durationMetric = rawMetricsData.value.find(m => m.Id === 'duration')
  if (!durationMetric?.Timestamps?.length) {
    return { labels: [], datasets: [] }
  }

  const sortedData = durationMetric.Timestamps
    .map((ts, i) => ({ timestamp: new Date(ts), value: durationMetric.Values?.[i] || 0 }))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

  return {
    labels: sortedData.map(d => d.timestamp.toLocaleDateString()),
    datasets: [{
      label: 'Duração média (ms)',
      data: sortedData.map(d => d.value),
      backgroundColor: 'rgba(147, 51, 234, 0.8)',
      borderRadius: 4
    }]
  }
})

const lineChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false }
  },
  scales: {
    y: {
      beginAtZero: true,
      grid: { color: 'rgba(0,0,0,0.05)' }
    },
    x: {
      grid: { display: false }
    }
  }
}

const errorChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false }
  },
  scales: {
    y: {
      beginAtZero: true,
      max: 100,
      grid: { color: 'rgba(0,0,0,0.05)' }
    },
    x: {
      grid: { display: false }
    }
  }
}

const barChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false }
  },
  scales: {
    y: {
      beginAtZero: true,
      grid: { color: 'rgba(0,0,0,0.05)' }
    },
    x: {
      grid: { display: false }
    }
  }
}

const fetchIntegrations = async () => {
  try {
    const data = await api.get<{ integrations: Integration[] }>('/lambda/integrations')
    integrations.value = data.integrations
    if (integrations.value.length > 0) {
      const hasSelected = integrations.value.some(integration => String(integration.id) === String(selectedIntegrationId.value))
      if (!selectedIntegrationId.value || !hasSelected) {
        const firstIntegration = integrations.value[0]
        if (firstIntegration) {
          selectedIntegrationId.value = String(firstIntegration.id)
          await loadData()
        }
      }
    }
  } catch (error) {
    console.error('Falha ao buscar integrações:', error)
  }
}

const loadData = async () => {
  if (!selectedIntegrationId.value) return
  isLoading.value = true
  const restored = restoreAiSummaryFromStorage()
  if (!restored) {
    resetAiSummaryState()
  }

  try {
    await Promise.all([
      loadMetrics(),
      loadLogs()
    ])
  } finally {
    isLoading.value = false
  }
}

const refreshData = () => {
  loadData()
}

const loadMetrics = async () => {
  try {
    const days = parseInt(timePeriod.value)
    const data = await api.get<{ metrics: MetricDataResult[], functionName: string }>(
      `/lambda/metrics/${selectedIntegrationId.value}?days=${days}`
    )

    rawMetricsData.value = data.metrics

    const invocationsMetric = data.metrics.find(m => m.Id === 'invocations')
    const errorsMetric = data.metrics.find(m => m.Id === 'errors')
    const durationMetric = data.metrics.find(m => m.Id === 'duration')

    const totalInvocations = invocationsMetric?.Values?.reduce((a, b) => a + b, 0) || 0
    const totalErrors = errorsMetric?.Values?.reduce((a, b) => a + b, 0) || 0
    const avgDuration = durationMetric?.Values?.[0] || 0

    metrics.value = {
      invocations: totalInvocations,
      errors: totalErrors,
      duration: avgDuration,
      errorRate: totalInvocations > 0 ? (totalErrors / totalInvocations) * 100 : 0,
      throttles: 0,
      concurrentExecutions: 0
    }

    // Calculate cost estimate
    calculateCostEstimate(
      totalInvocations,
      avgDuration,
      selectedIntegration.value?.memoryMb ?? 128,
      selectedIntegration.value?.region
    )
  } catch (error) {
    console.error('Falha ao carregar métricas:', error)
  }
}

const loadLogs = async () => {
  try {
    const days = parseInt(timePeriod.value)
    const startTime = Date.now() - (days * 24 * 60 * 60 * 1000)
    const data = await api.get<{ logs: LogEntry[], summary: LogSummary }>(
      `/lambda/logs/${selectedIntegrationId.value}?type=${logFilter.value}&startTime=${startTime}&limit=100&simplify=${simplifyLogs.value ? '1' : '0'}&summary=1`
    )

    logs.value = data.logs
    logSummary.value = data.summary
    restoreAiSummaryFromStorage()
    await fetchAiSummaryStatus(startTime)
  } catch (error) {
    console.error('Falha ao carregar logs:', error)
  }
}

const toggleSummary = () => {
  showSummary.value = !showSummary.value
  if (showSummary.value) {
    loadLogs()
  }
}

const resetAiSummaryState = () => {
  aiSummaryStatus.value = 'idle'
  aiSummary.value = null
  aiSummaryModel.value = null
  aiSummaryRequestedAt.value = null
  aiSummaryGeneratedAt.value = null
  aiSummaryStartTime.value = null
  aiSummaryError.value = null
  aiSummaryModalOpen.value = false
  if (aiSummaryPollTimeout) {
    clearTimeout(aiSummaryPollTimeout)
    aiSummaryPollTimeout = null
  }
}

const getAiSummaryStorageKey = () => {
  if (!selectedIntegrationId.value) return null
  return `${aiSummaryStoragePrefix}:${selectedIntegrationId.value}`
}

const readAiSummaryStorage = () => {
  const key = getAiSummaryStorageKey()
  if (!key) return null
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as { startTime: number; type: string; limit: number; simplify: string }
  } catch {
    return null
  }
}

const saveAiSummaryStorage = (params: { startTime: number; type: string; limit: number; simplify: string }) => {
  const key = getAiSummaryStorageKey()
  if (!key) return
  localStorage.setItem(key, JSON.stringify(params))
}

const clearAiSummaryStorage = () => {
  const key = getAiSummaryStorageKey()
  if (!key) return
  localStorage.removeItem(key)
}

const restoreAiSummaryFromStorage = () => {
  const stored = readAiSummaryStorage()
  if (!stored) return false

  const simplifyFlag = simplifyLogs.value ? '1' : '0'
  if (stored.type !== logFilter.value || stored.simplify !== simplifyFlag || stored.limit !== 100) {
    clearAiSummaryStorage()
    return false
  }

  aiSummaryStartTime.value = stored.startTime
  if (aiSummaryStatus.value !== 'complete') {
    aiSummaryStatus.value = 'running'
  }
  return true
}

const buildAiSummaryQuery = (startTimeOverride?: number) => {
  const days = parseInt(timePeriod.value)
  const startTime = startTimeOverride ?? aiSummaryStartTime.value ?? Date.now() - (days * 24 * 60 * 60 * 1000)

  return {
    startTime,
    type: logFilter.value,
    limit: 100,
    simplify: simplifyLogs.value ? '1' : '0'
  }
}

const fetchAiSummaryStatus = async (startTimeOverride?: number) => {
  if (!selectedIntegrationId.value) return

  if (startTimeOverride && !aiSummaryStartTime.value) {
    aiSummaryStartTime.value = startTimeOverride
  }

  const params = buildAiSummaryQuery(startTimeOverride)

  try {
    const data = await api.get<{ status: string; summary?: string; model?: string; requestedAt?: number; generatedAt?: number; error?: string }>(
      `/lambda/logs/${selectedIntegrationId.value}/ai-summary/status?type=${params.type}&startTime=${params.startTime}&limit=${params.limit}&simplify=${params.simplify}`
    )

    aiSummaryStatus.value = (data.status as typeof aiSummaryStatus.value) || 'idle'
    aiSummary.value = data.summary || null
    aiSummaryModel.value = data.model || null
    aiSummaryRequestedAt.value = data.requestedAt || null
    aiSummaryGeneratedAt.value = data.generatedAt || null
    aiSummaryError.value = data.error || null

    if (aiSummaryStatus.value === 'idle') {
      clearAiSummaryStorage()
    }

    if (aiSummaryStatus.value === 'running') {
      scheduleAiSummaryPoll()
    } else {
      if (aiSummaryPollTimeout) {
        clearTimeout(aiSummaryPollTimeout)
        aiSummaryPollTimeout = null
      }
    }
  } catch (error) {
    console.error('Falha ao buscar status do resumo inteligente:', error)
  }
}

const scheduleAiSummaryPoll = () => {
  if (aiSummaryPollTimeout) {
    clearTimeout(aiSummaryPollTimeout)
  }
  aiSummaryPollTimeout = setTimeout(() => fetchAiSummaryStatus(), 4000)
}

const startAiSummary = async () => {
  if (!selectedIntegrationId.value) return

  const params = buildAiSummaryQuery()

  aiSummaryStartTime.value = params.startTime
  saveAiSummaryStorage(params)

  aiSummaryStatus.value = 'running'
  aiSummaryError.value = null
  scheduleAiSummaryPoll()

  try {
    const data = await api.post<{ status: string; summary?: string; model?: string; requestedAt?: number; generatedAt?: number; error?: string }>(
      `/lambda/logs/${selectedIntegrationId.value}/ai-summary/start?type=${params.type}&startTime=${params.startTime}&limit=${params.limit}&simplify=${params.simplify}`
    )

    aiSummaryStatus.value = (data.status as typeof aiSummaryStatus.value) || 'running'
    aiSummary.value = data.summary || null
    aiSummaryModel.value = data.model || null
    aiSummaryRequestedAt.value = data.requestedAt || null
    aiSummaryGeneratedAt.value = data.generatedAt || null
    aiSummaryError.value = data.error || null

    if (aiSummaryStatus.value === 'running') {
      scheduleAiSummaryPoll()
    }
  } catch (error) {
    console.error('Falha ao iniciar resumo inteligente:', error)
    aiSummaryStatus.value = 'error'
    aiSummaryError.value = 'Não foi possível iniciar o resumo agora.'
  }
}

const handleAiSummaryAction = async () => {
  if (aiSummaryStatus.value === 'complete') {
    aiSummaryModalOpen.value = true
    return
  }

  await startAiSummary()
}

const closeAiSummaryModal = () => {
  aiSummaryModalOpen.value = false
}

const clearAiSummary = async () => {
  if (!selectedIntegrationId.value) return

  const params = buildAiSummaryQuery()

  try {
    await api.del(
      `/lambda/logs/${selectedIntegrationId.value}/ai-summary?type=${params.type}&startTime=${params.startTime}&limit=${params.limit}&simplify=${params.simplify}`
    )
  } catch (error) {
    console.error('Falha ao limpar resumo inteligente:', error)
  }

  resetAiSummaryState()
  clearAiSummaryStorage()
}

const aiSummaryButtonLabel = computed(() => {
  if (aiSummaryStatus.value === 'complete') return 'Visualizar resumo gerado'
  if (aiSummaryStatus.value === 'running') return 'Gerando resumo...'
  if (aiSummaryStatus.value === 'error') return 'Gerar resumo novamente'
  return 'Resumo inteligente (Copilot)'
})

const lambdaPricingByRegion: Record<string, { requestPrice: number; gbSecondPrice: number }> = {
  'us-east-1': { requestPrice: 0.20 / 1000000, gbSecondPrice: 0.0000166667 },
  'us-east-2': { requestPrice: 0.20 / 1000000, gbSecondPrice: 0.0000166667 }
}

type PricingResolution = {
  requestPrice: number
  gbSecondPrice: number
  pricingRegion: string
  pricingSource: 'selected' | 'fallback'
}

const resolvePricing = (region?: string): PricingResolution => {
  const normalizedRegion = (region || '').toLowerCase()
  if (normalizedRegion && lambdaPricingByRegion[normalizedRegion]) {
    return {
      pricingRegion: normalizedRegion,
      pricingSource: 'selected' as const,
      ...lambdaPricingByRegion[normalizedRegion]
    }
  }

  const fallback = lambdaPricingByRegion['us-east-2'] || { requestPrice: 0, gbSecondPrice: 0 }

  return {
    pricingRegion: 'us-east-2',
    pricingSource: 'fallback' as const,
    requestPrice: fallback.requestPrice,
    gbSecondPrice: fallback.gbSecondPrice
  }
}

const calculateCostEstimate = (invocations: number, avgDurationMs: number, memoryMb: number, region?: string) => {
  const pricing = resolvePricing(region)
  const memoryMB = memoryMb || 128

  const avgDurationSeconds = avgDurationMs / 1000
  const memoryGB = memoryMB / 1024
  const totalGBSeconds = invocations * avgDurationSeconds * memoryGB

  const requestCost = invocations * pricing.requestPrice
  const computeCost = totalGBSeconds * pricing.gbSecondPrice

  costEstimate.value = {
    totalInvocations: invocations,
    totalGBSeconds,
    requestCost,
    computeCost,
    totalCost: requestCost + computeCost,
    currency: 'USD',
    period: `Últimos ${timePeriod.value} dias`,
    pricingRegion: pricing.pricingRegion,
    pricingSource: pricing.pricingSource
  }
}

const formatNumber = (num: number): string => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
  return num.toString()
}

const formatDuration = (ms: number): string => {
  if (ms >= 1000) return (ms / 1000).toFixed(2) + 's'
  return Math.round(ms) + 'ms'
}

const getLogType = (message: string): string => {
  const msg = message.toLowerCase()
  if (msg.includes('error') || msg.includes('exception') || msg.includes('fail')) return 'ERRO'
  if (msg.includes('report')) return 'RELATÓRIO'
  if (msg.includes('start')) return 'INÍCIO'
  if (msg.includes('end')) return 'FIM'
  return 'INFO'
}

const getDisplayMessage = (log: LogEntry): string => {
  if (simplifyLogs.value && log.simplifiedMessage) {
    return log.simplifiedMessage
  }
  return log.message
}

const getDisplayType = (log: LogEntry): string => {
  if (simplifyLogs.value && log.category) {
    return log.category
  }
  return getLogType(log.message)
}

const getDisplayTypeClass = (log: LogEntry): string => {
  if (simplifyLogs.value && log.level) {
    if (log.level === 'error') return 'bg-red-100 text-red-800'
    if (log.level === 'warn') return 'bg-amber-100 text-amber-800'
    return 'bg-blue-100 text-blue-800'
  }
  return getLogTypeClass(log.message)
}

const getLogTypeClass = (message: string): string => {
  const type = getLogType(message)
  switch (type) {
    case 'ERRO': return 'bg-red-100 text-red-800'
    case 'RELATÓRIO': return 'bg-purple-100 text-purple-800'
    case 'INÍCIO': return 'bg-green-100 text-green-800'
    case 'FIM': return 'bg-gray-100 text-gray-800'
    default: return 'bg-blue-100 text-blue-800'
  }
}

const handleLogout = async () => {
  await auth.logout()
  router.push('/login')
}

const openDocFullscreen = (link: string) => {
  fullscreenDocLink.value = link
}

const closeDocFullscreen = () => {
  fullscreenDocLink.value = null
}

onMounted(async () => {
  if (!auth.isAuthenticated || !auth.isClient) {
    router.push('/login')
    return
  }
  await fetchIntegrations()
})
</script>
