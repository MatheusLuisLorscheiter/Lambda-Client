<template>
  <div>
    <div class="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div class="flex flex-1 flex-col gap-3 sm:flex-row">
        <div>
          <label class="mb-1 block text-xs font-medium text-slate-500">Empresa</label>
          <select v-model="companyFilter" class="min-w-52 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="">Todas as empresas</option>
            <option v-for="company in companies" :key="company.id" :value="String(company.id)">{{ company.name }}</option>
          </select>
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-slate-500">Status</label>
          <select v-model="statusFilter" class="min-w-48 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="">Todos os status</option>
            <option v-for="status in statuses" :key="status.value" :value="status.value">{{ status.label }}</option>
          </select>
        </div>
      </div>
      <button class="rounded-md bg-slate-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800" @click="openCreate">
        + Adicionar demanda
      </button>
    </div>

    <div class="mb-5 grid gap-3 sm:grid-cols-4">
      <div v-for="summary in summaries" :key="summary.label" class="rounded-lg border border-slate-200 bg-white p-4">
        <p class="text-xs font-medium text-slate-500">{{ summary.label }}</p>
        <p class="mt-1 text-2xl font-semibold text-slate-950">{{ summary.value }}</p>
      </div>
    </div>

    <div class="overflow-hidden rounded-lg border border-slate-200">
      <div v-if="loading" class="p-10 text-center text-sm text-slate-500">Carregando demandas...</div>
      <div v-else-if="filteredProcesses.length" class="divide-y divide-slate-100 bg-white">
        <button
          v-for="item in filteredProcesses"
          :key="item.id"
          class="grid w-full gap-3 px-5 py-4 text-left hover:bg-slate-50 lg:grid-cols-[minmax(0,1fr)_180px_150px_110px]"
          @click="openEdit(item)"
        >
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span :class="statusClass(item.status)" class="rounded-full px-2 py-0.5 text-xs font-medium">{{ statusLabel(item.status) }}</span>
              <span v-if="item.position && item.status === 'queued'" class="text-xs font-medium text-slate-500">#{{ item.position }} na fila</span>
            </div>
            <p class="mt-2 truncate font-medium text-slate-950">{{ item.title }}</p>
            <p class="mt-1 truncate text-sm text-slate-500">{{ item.latestUpdate || item.description }}</p>
          </div>
          <div><p class="text-xs text-slate-400">Empresa</p><p class="mt-1 text-sm font-medium text-slate-700">{{ item.companyName }}</p></div>
          <div><p class="text-xs text-slate-400">Previsão</p><p class="mt-1 text-sm text-slate-700">{{ item.dueDate ? formatDate(item.dueDate) : 'A definir' }}</p></div>
          <div><p class="text-xs text-slate-400">Progresso</p><p class="mt-1 text-sm font-medium text-slate-700">{{ item.progress }}%</p></div>
        </button>
      </div>
      <div v-else class="bg-white p-12 text-center text-sm text-slate-500">Nenhuma demanda encontrada.</div>
    </div>

    <transition name="fade">
      <div v-if="editorOpen" class="fixed inset-0 z-50">
        <div class="absolute inset-0 bg-slate-950/50" @click="closeEditor"></div>
        <aside class="absolute inset-y-0 right-0 w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-white shadow-xl">
          <form @submit.prevent="saveProcess">
            <div class="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-5">
              <div>
                <h3 class="text-lg font-semibold text-slate-950">{{ editor.id ? 'Atualizar demanda' : 'Adicionar demanda' }}</h3>
                <p class="mt-0.5 text-sm text-slate-500">As alterações ficam visíveis para o cliente.</p>
              </div>
              <button type="button" class="rounded-md p-2 text-slate-500 hover:bg-slate-100" @click="closeEditor">✕</button>
            </div>

            <div class="space-y-5 p-6">
              <div v-if="!editor.id">
                <label class="mb-1.5 block text-sm font-medium text-slate-700">Empresa</label>
                <select v-model="editor.companyId" required class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm">
                  <option value="">Selecione...</option>
                  <option v-for="company in companies" :key="company.id" :value="String(company.id)">{{ company.name }}</option>
                </select>
              </div>
              <div>
                <label class="mb-1.5 block text-sm font-medium text-slate-700">Título</label>
                <input v-model="editor.title" required maxlength="160" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label class="mb-1.5 block text-sm font-medium text-slate-700">Descrição</label>
                <textarea v-model="editor.description" required rows="5" class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm"></textarea>
              </div>
              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <label class="mb-1.5 block text-sm font-medium text-slate-700">Status</label>
                  <select v-model="editor.status" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm">
                    <option v-for="status in statuses" :key="status.value" :value="status.value">{{ status.label }}</option>
                  </select>
                </div>
                <div>
                  <label class="mb-1.5 block text-sm font-medium text-slate-700">Categoria</label>
                  <select v-model="editor.category" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm">
                    <option value="automation">Automação</option><option value="integration">Integração</option>
                    <option value="improvement">Melhoria</option><option value="maintenance">Manutenção</option><option value="support">Suporte</option>
                  </select>
                </div>
                <div>
                  <label class="mb-1.5 block text-sm font-medium text-slate-700">Prioridade</label>
                  <select v-model="editor.priority" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm">
                    <option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option>
                  </select>
                </div>
                <div>
                  <label class="mb-1.5 block text-sm font-medium text-slate-700">Complexidade</label>
                  <select v-model="editor.complexity" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm">
                    <option value="">A definir</option><option value="simple">Simples</option><option value="medium">Média</option><option value="complex">Complexa</option>
                  </select>
                </div>
                <div>
                  <label class="mb-1.5 block text-sm font-medium text-slate-700">Posição na fila</label>
                  <input v-model.number="editor.position" type="number" min="1" placeholder="Ex.: 2" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label class="mb-1.5 block text-sm font-medium text-slate-700">Estimativa (dias úteis)</label>
                  <input v-model.number="editor.estimateBusinessDays" type="number" min="1" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label class="mb-1.5 block text-sm font-medium text-slate-700">Início planejado</label>
                  <input v-model="editor.plannedStart" type="date" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label class="mb-1.5 block text-sm font-medium text-slate-700">Previsão de entrega</label>
                  <input v-model="editor.dueDate" type="date" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm" />
                </div>
              </div>
              <div>
                <div class="mb-1.5 flex justify-between"><label class="text-sm font-medium text-slate-700">Progresso</label><span class="text-sm font-medium text-slate-500">{{ editor.progress }}%</span></div>
                <input v-model.number="editor.progress" type="range" min="0" max="100" step="5" class="w-full accent-indigo-600" />
              </div>
              <div>
                <label class="mb-1.5 block text-sm font-medium text-slate-700">Atualização para o cliente</label>
                <textarea v-model="editor.latestUpdate" rows="3" placeholder="Ex.: Integração com o Omie concluída; iniciamos os testes de duplicidade." class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm"></textarea>
              </div>
              <p v-if="formError" class="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{{ formError }}</p>
            </div>

            <div class="sticky bottom-0 flex justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
              <button type="button" class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" @click="closeEditor">Cancelar</button>
              <button :disabled="saving" class="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {{ saving ? 'Salvando...' : 'Salvar demanda' }}
              </button>
            </div>
          </form>
        </aside>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useApi } from '@/composables/useApi'
import type { Company, ProcessItem, ProcessStatus } from '@/types'

defineProps<{ companies: Company[] }>()
const api = useApi()
const processes = ref<ProcessItem[]>([])
const loading = ref(true)
const saving = ref(false)
const formError = ref('')
const companyFilter = ref('')
const statusFilter = ref('')
const editorOpen = ref(false)
const emptyEditor = () => ({
  id: null as number | null, companyId: '', title: '', description: '', category: 'automation',
  status: 'requested' as ProcessStatus, priority: 'normal', complexity: '', position: null as number | null,
  estimateBusinessDays: null as number | null, plannedStart: '', dueDate: '', progress: 0, latestUpdate: ''
})
const editor = ref(emptyEditor())
const statuses: Array<{ value: ProcessStatus; label: string }> = [
  { value: 'requested', label: 'Recebida' }, { value: 'analysis', label: 'Em análise' }, { value: 'queued', label: 'Na fila' },
  { value: 'in_progress', label: 'Em desenvolvimento' }, { value: 'validation', label: 'Em validação' }, { value: 'delivered', label: 'Entregue' },
  { value: 'paused', label: 'Pausada' }, { value: 'cancelled', label: 'Cancelada' }
]
const filteredProcesses = computed(() => processes.value.filter(item =>
  (!companyFilter.value || String(item.companyId) === companyFilter.value) &&
  (!statusFilter.value || item.status === statusFilter.value)
))
const summaries = computed(() => [
  { label: 'Recebidas / análise', value: processes.value.filter(item => ['requested', 'analysis'].includes(item.status)).length },
  { label: 'Na fila', value: processes.value.filter(item => item.status === 'queued').length },
  { label: 'Em execução', value: processes.value.filter(item => ['in_progress', 'validation'].includes(item.status)).length },
  { label: 'Entregues', value: processes.value.filter(item => item.status === 'delivered').length }
])
const statusLabel = (status: ProcessStatus) => statuses.find(item => item.value === status)?.label || status
const statusClass = (status: ProcessStatus) => ({
  requested: 'bg-slate-100 text-slate-700', analysis: 'bg-amber-100 text-amber-800', queued: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-indigo-100 text-indigo-800', validation: 'bg-violet-100 text-violet-800', delivered: 'bg-emerald-100 text-emerald-800',
  paused: 'bg-orange-100 text-orange-800', cancelled: 'bg-red-100 text-red-800'
}[status])
const formatDate = (date: string) => new Intl.DateTimeFormat('pt-BR').format(new Date(`${date}T12:00:00`))
const fetchProcesses = async () => {
  loading.value = true
  try { processes.value = (await api.get<{ processes: ProcessItem[] }>('/processes')).processes }
  finally { loading.value = false }
}
const openCreate = () => { editor.value = emptyEditor(); editorOpen.value = true }
const openEdit = (item: ProcessItem) => {
  editor.value = {
    id: item.id, companyId: String(item.companyId), title: item.title, description: item.description,
    category: item.category, status: item.status, priority: item.priority, complexity: item.complexity || '',
    position: item.position, estimateBusinessDays: item.estimateBusinessDays,
    plannedStart: item.plannedStart?.slice(0, 10) || '', dueDate: item.dueDate?.slice(0, 10) || '',
    progress: item.progress, latestUpdate: item.latestUpdate || ''
  }
  editorOpen.value = true
}
const closeEditor = () => { editorOpen.value = false; formError.value = '' }
const saveProcess = async () => {
  saving.value = true
  formError.value = ''
  const payload = {
    companyId: Number(editor.value.companyId), title: editor.value.title, description: editor.value.description,
    category: editor.value.category, status: editor.value.status, priority: editor.value.priority,
    complexity: editor.value.complexity || null, position: editor.value.position || null,
    estimateBusinessDays: editor.value.estimateBusinessDays || null, plannedStart: editor.value.plannedStart || null,
    dueDate: editor.value.dueDate || null, progress: editor.value.progress, latestUpdate: editor.value.latestUpdate
  }
  try {
    if (editor.value.id) await api.patch(`/processes/${editor.value.id}`, payload)
    else await api.post('/processes', payload)
    await fetchProcesses()
    closeEditor()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Não foi possível salvar a demanda'
  } finally { saving.value = false }
}
onMounted(fetchProcesses)
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity .18s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
