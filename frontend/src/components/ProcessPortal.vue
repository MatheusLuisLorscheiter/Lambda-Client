<template>
  <section>
    <div v-if="loading" class="flex min-h-64 items-center justify-center text-sm text-slate-500">
      Carregando sua esteira de automações...
    </div>

    <template v-else-if="mode === 'overview'">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article class="rounded-lg border border-slate-200 bg-white p-5">
          <p class="text-xs font-medium uppercase tracking-wide text-slate-500">Em desenvolvimento</p>
          <p class="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{{ statusCount('in_progress') }}</p>
          <p class="mt-1 text-sm text-slate-500">Itens em execução agora</p>
        </article>
        <article class="rounded-lg border border-slate-200 bg-white p-5">
          <p class="text-xs font-medium uppercase tracking-wide text-slate-500">Próximas na fila</p>
          <p class="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{{ statusCount('queued') }}</p>
          <p class="mt-1 text-sm text-slate-500">Demandas já analisadas</p>
        </article>
        <article class="rounded-lg border border-slate-200 bg-white p-5">
          <p class="text-xs font-medium uppercase tracking-wide text-slate-500">Em análise</p>
          <p class="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{{ statusCount('requested') + statusCount('analysis') }}</p>
          <p class="mt-1 text-sm text-slate-500">Retorno em até 48h úteis</p>
        </article>
        <article class="rounded-lg border border-slate-200 bg-white p-5">
          <p class="text-xs font-medium uppercase tracking-wide text-slate-500">Entregues</p>
          <p class="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{{ statusCount('delivered') }}</p>
          <p class="mt-1 text-sm text-slate-500">Histórico de melhorias</p>
        </article>
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div class="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div class="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h3 class="font-semibold text-slate-950">Em andamento</h3>
              <p class="mt-0.5 text-sm text-slate-500">O que está sendo trabalhado e o próximo passo</p>
            </div>
            <button class="text-sm font-medium text-indigo-600 hover:text-indigo-700" @click="$emit('openQueue')">
              Ver fila completa
            </button>
          </div>

          <div v-if="activeProcesses.length" class="divide-y divide-slate-100">
            <button
              v-for="item in activeProcesses"
              :key="item.id"
              class="block w-full px-5 py-4 text-left transition hover:bg-slate-50"
              @click="selectedProcess = item"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span :class="statusClass(item.status)" class="rounded-full px-2 py-0.5 text-xs font-medium">
                      {{ statusLabel(item.status) }}
                    </span>
                    <span v-if="item.position && item.status === 'queued'" class="text-xs text-slate-500">
                      #{{ item.position }} na fila
                    </span>
                  </div>
                  <p class="mt-2 font-medium text-slate-950">{{ item.title }}</p>
                  <p class="mt-1 line-clamp-2 text-sm text-slate-500">
                    {{ item.latestUpdate || item.description }}
                  </p>
                </div>
                <span class="whitespace-nowrap text-xs text-slate-500">{{ deliveryLabel(item) }}</span>
              </div>
              <div v-if="item.status === 'in_progress' || item.status === 'validation'" class="mt-3">
                <div class="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div class="h-full rounded-full bg-indigo-600 transition-all" :style="{ width: `${item.progress}%` }"></div>
                </div>
                <p class="mt-1.5 text-xs text-slate-500">{{ item.progress }}% concluído</p>
              </div>
            </button>
          </div>
          <div v-else class="px-5 py-12 text-center">
            <p class="font-medium text-slate-900">Nenhuma demanda em andamento</p>
            <p class="mt-1 text-sm text-slate-500">Envie uma ideia para iniciar a análise de viabilidade.</p>
            <button class="mt-4 rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800" @click="requestModalOpen = true">
              Nova solicitação
            </button>
          </div>
        </div>

        <aside class="rounded-lg border border-slate-200 bg-white p-5">
          <h3 class="font-semibold text-slate-950">Como funciona</h3>
          <ol class="mt-5 space-y-5">
            <li v-for="(step, index) in workflowSteps" :key="step.title" class="flex gap-3">
              <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-300 text-xs font-semibold text-slate-700">
                {{ index + 1 }}
              </span>
              <div>
                <p class="text-sm font-medium text-slate-900">{{ step.title }}</p>
                <p class="mt-0.5 text-xs leading-5 text-slate-500">{{ step.description }}</p>
              </div>
            </li>
          </ol>
          <div class="mt-5 border-t border-slate-200 pt-4">
            <p class="text-xs leading-5 text-slate-500">
              Manutenção das automações ativas e suporte técnico continuam inclusos no acompanhamento.
            </p>
          </div>
        </aside>
      </div>
    </template>

    <template v-else>
      <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex flex-wrap gap-2">
          <button
            v-for="filter in queueFilters"
            :key="filter.value"
            class="rounded-md px-3 py-2 text-sm font-medium transition"
            :class="queueFilter === filter.value ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'"
            @click="queueFilter = filter.value"
          >
            {{ filter.label }}
            <span class="ml-1 opacity-70">{{ filter.count }}</span>
          </button>
        </div>
        <button class="rounded-md bg-slate-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800" @click="requestModalOpen = true">
          + Nova solicitação
        </button>
      </div>

      <div class="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div v-if="filteredProcesses.length" class="divide-y divide-slate-100">
          <button
            v-for="item in filteredProcesses"
            :key="item.id"
            class="grid w-full gap-3 px-5 py-4 text-left transition hover:bg-slate-50 md:grid-cols-[minmax(0,1fr)_150px_140px]"
            @click="selectedProcess = item"
          >
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span :class="statusClass(item.status)" class="rounded-full px-2 py-0.5 text-xs font-medium">
                  {{ statusLabel(item.status) }}
                </span>
                <span v-if="item.position && item.status === 'queued'" class="text-xs font-medium text-slate-500">Fila #{{ item.position }}</span>
                <span class="text-xs text-slate-400">{{ categoryLabel(item.category) }}</span>
              </div>
              <p class="mt-2 font-medium text-slate-950">{{ item.title }}</p>
              <p class="mt-1 truncate text-sm text-slate-500">{{ item.latestUpdate || item.description }}</p>
            </div>
            <div>
              <p class="text-xs text-slate-400">Previsão</p>
              <p class="mt-1 text-sm font-medium text-slate-700">{{ deliveryLabel(item) }}</p>
            </div>
            <div>
              <p class="text-xs text-slate-400">Atualizado</p>
              <p class="mt-1 text-sm text-slate-600">{{ formatDate(item.updatedAt) }}</p>
            </div>
          </button>
        </div>
        <div v-else class="px-5 py-14 text-center text-sm text-slate-500">
          Nenhuma demanda encontrada neste filtro.
        </div>
      </div>
    </template>

    <transition name="fade">
      <div v-if="requestModalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-slate-950/55" @click="closeRequestModal"></div>
        <div class="relative w-full max-w-xl rounded-lg border border-slate-200 bg-white shadow-xl">
          <div class="border-b border-slate-200 px-6 py-5">
            <h3 class="text-lg font-semibold text-slate-950">Nova solicitação</h3>
            <p class="mt-1 text-sm text-slate-500">Conte qual gargalo ou melhoria você quer resolver.</p>
          </div>
          <form class="space-y-4 p-6" @submit.prevent="submitRequest">
            <div>
              <label class="mb-1.5 block text-sm font-medium text-slate-700">Título</label>
              <input v-model="requestForm.title" required maxlength="160" placeholder="Ex.: Integrar novos pedidos do Omie ao CRM" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label class="mb-1.5 block text-sm font-medium text-slate-700">Tipo de demanda</label>
              <select v-model="requestForm.category" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500">
                <option value="automation">Nova automação</option>
                <option value="integration">Integração entre sistemas</option>
                <option value="improvement">Melhoria em fluxo existente</option>
                <option value="maintenance">Manutenção corretiva</option>
                <option value="support">Suporte técnico</option>
              </select>
            </div>
            <div>
              <label class="mb-1.5 block text-sm font-medium text-slate-700">Contexto e resultado esperado</label>
              <textarea v-model="requestForm.description" required rows="6" maxlength="5000" placeholder="Descreva como o processo funciona hoje, onde está o gargalo e o que seria um bom resultado." class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"></textarea>
              <p class="mt-1 text-xs text-slate-400">Após o envio, a análise de viabilidade ocorre em até 48h úteis.</p>
            </div>
            <p v-if="requestError" class="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{{ requestError }}</p>
            <div class="flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button type="button" class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" @click="closeRequestModal">Cancelar</button>
              <button :disabled="submitting" class="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {{ submitting ? 'Enviando...' : 'Enviar para análise' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="selectedProcess" class="fixed inset-0 z-50">
        <div class="absolute inset-0 bg-slate-950/45" @click="selectedProcess = null"></div>
        <aside class="absolute inset-y-0 right-0 w-full max-w-lg overflow-y-auto border-l border-slate-200 bg-white shadow-xl">
          <div class="flex items-start justify-between border-b border-slate-200 px-6 py-5">
            <div>
              <span :class="statusClass(selectedProcess.status)" class="rounded-full px-2 py-0.5 text-xs font-medium">{{ statusLabel(selectedProcess.status) }}</span>
              <h3 class="mt-3 text-xl font-semibold text-slate-950">{{ selectedProcess.title }}</h3>
            </div>
            <button class="rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Fechar" @click="selectedProcess = null">✕</button>
          </div>
          <div class="space-y-6 p-6">
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Solicitação</p>
              <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{{ selectedProcess.description }}</p>
            </div>
            <div v-if="selectedProcess.latestUpdate" class="rounded-md border border-indigo-100 bg-indigo-50 p-4">
              <p class="text-xs font-medium uppercase tracking-wide text-indigo-600">Última atualização</p>
              <p class="mt-2 text-sm leading-6 text-indigo-950">{{ selectedProcess.latestUpdate }}</p>
            </div>
            <dl class="grid grid-cols-2 gap-4 border-t border-slate-200 pt-5">
              <div><dt class="text-xs text-slate-400">Posição</dt><dd class="mt-1 text-sm font-medium text-slate-800">{{ selectedProcess.position ? `#${selectedProcess.position}` : '—' }}</dd></div>
              <div><dt class="text-xs text-slate-400">Previsão</dt><dd class="mt-1 text-sm font-medium text-slate-800">{{ deliveryLabel(selectedProcess) }}</dd></div>
              <div><dt class="text-xs text-slate-400">Complexidade</dt><dd class="mt-1 text-sm font-medium text-slate-800">{{ complexityLabel(selectedProcess.complexity) }}</dd></div>
              <div><dt class="text-xs text-slate-400">Solicitado em</dt><dd class="mt-1 text-sm font-medium text-slate-800">{{ formatDate(selectedProcess.createdAt) }}</dd></div>
            </dl>
          </div>
        </aside>
      </div>
    </transition>

    <div v-if="successMessage" class="fixed bottom-5 right-5 z-50 rounded-md bg-slate-950 px-4 py-3 text-sm font-medium text-white shadow-lg">
      {{ successMessage }}
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useApi } from '@/composables/useApi'
import type { ProcessItem, ProcessStatus } from '@/types'

defineProps<{ mode: 'overview' | 'queue' }>()
defineEmits<{ openQueue: [] }>()

const api = useApi()
const processes = ref<ProcessItem[]>([])
const loading = ref(true)
const queueFilter = ref<'active' | 'delivered' | 'all'>('active')
const requestModalOpen = ref(false)
const selectedProcess = ref<ProcessItem | null>(null)
const submitting = ref(false)
const requestError = ref('')
const successMessage = ref('')
const requestForm = ref({ title: '', category: 'automation', description: '' })

const activeStatuses: ProcessStatus[] = ['requested', 'analysis', 'queued', 'in_progress', 'validation', 'paused']
const activeProcesses = computed(() => processes.value.filter(item => activeStatuses.includes(item.status)).slice(0, 5))
const filteredProcesses = computed(() => {
  if (queueFilter.value === 'delivered') return processes.value.filter(item => item.status === 'delivered')
  if (queueFilter.value === 'active') return processes.value.filter(item => activeStatuses.includes(item.status))
  return processes.value
})
const queueFilters = computed(() => [
  { value: 'active' as const, label: 'Em andamento', count: processes.value.filter(item => activeStatuses.includes(item.status)).length },
  { value: 'delivered' as const, label: 'Entregues', count: statusCount('delivered') },
  { value: 'all' as const, label: 'Todas', count: processes.value.length }
])
const workflowSteps = [
  { title: 'Solicitação', description: 'Você registra o gargalo e o resultado esperado.' },
  { title: 'Análise de viabilidade', description: 'Retornamos com escopo e estimativa em até 48h úteis.' },
  { title: 'Fila técnica', description: 'A demanda aprovada recebe posição e previsão de execução.' },
  { title: 'Desenvolvimento e entrega', description: 'Acompanhe o progresso até a validação final.' }
]

const statusCount = (status: ProcessStatus) => processes.value.filter(item => item.status === status).length
const statusLabel = (status: ProcessStatus) => ({
  requested: 'Recebida', analysis: 'Em análise', queued: 'Na fila', in_progress: 'Em desenvolvimento',
  validation: 'Em validação', delivered: 'Entregue', paused: 'Pausada', cancelled: 'Cancelada'
}[status])
const statusClass = (status: ProcessStatus) => ({
  requested: 'bg-slate-100 text-slate-700', analysis: 'bg-amber-100 text-amber-800', queued: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-indigo-100 text-indigo-800', validation: 'bg-violet-100 text-violet-800',
  delivered: 'bg-emerald-100 text-emerald-800', paused: 'bg-orange-100 text-orange-800', cancelled: 'bg-red-100 text-red-800'
}[status])
const categoryLabel = (category: ProcessItem['category']) => ({
  automation: 'Automação', integration: 'Integração', maintenance: 'Manutenção', improvement: 'Melhoria', support: 'Suporte'
}[category])
const complexityLabel = (complexity: ProcessItem['complexity']) => complexity ? ({ simple: 'Simples', medium: 'Média', complex: 'Complexa' }[complexity]) : 'Em análise'
const formatDate = (date: string) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date))
const deliveryLabel = (item: ProcessItem) => {
  if (item.status === 'delivered' && item.deliveredAt) return formatDate(item.deliveredAt)
  if (item.dueDate) return formatDate(item.dueDate)
  if (item.estimateBusinessDays) return `${item.estimateBusinessDays} dias úteis`
  return item.status === 'requested' || item.status === 'analysis' ? 'Após análise' : 'A definir'
}

const fetchProcesses = async () => {
  loading.value = true
  try {
    const data = await api.get<{ processes: ProcessItem[] }>('/processes')
    processes.value = data.processes
  } finally {
    loading.value = false
  }
}
const closeRequestModal = () => {
  requestModalOpen.value = false
  requestError.value = ''
}
const submitRequest = async () => {
  submitting.value = true
  requestError.value = ''
  try {
    const data = await api.post<{ process: ProcessItem }>('/processes', { ...requestForm.value })
    processes.value.unshift(data.process)
    requestForm.value = { title: '', category: 'automation', description: '' }
    closeRequestModal()
    successMessage.value = 'Solicitação enviada para análise'
    setTimeout(() => { successMessage.value = '' }, 3500)
  } catch (error) {
    requestError.value = error instanceof Error ? error.message : 'Não foi possível enviar a solicitação'
  } finally {
    submitting.value = false
  }
}

onMounted(fetchProcesses)
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active { transition: opacity 0.18s ease; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }
</style>
