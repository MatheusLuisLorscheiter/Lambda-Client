<template>
  <section>
    <div class="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
      <div class="grid min-w-0 flex-1 gap-3" :class="auth.isAdmin ? 'sm:grid-cols-[minmax(0,1fr)_180px_180px]' : 'sm:grid-cols-1'">
        <label>
          <span class="mb-1 block text-xs font-medium text-slate-500">Buscar no histórico</span>
          <input
            v-model="search"
            type="search"
            placeholder="Autor, campo ou descrição"
            class="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900"
            @input="scheduleLoad"
          >
        </label>
        <label v-if="auth.isAdmin">
          <span class="mb-1 block text-xs font-medium text-slate-500">Responsável</span>
          <select v-model="actorRole" class="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" @change="resetAndLoad">
            <option value="">Todas as pessoas</option>
            <option value="client">Cliente</option>
            <option value="admin">Equipe técnica</option>
            <option value="system">Sistema</option>
          </select>
        </label>
        <label v-if="auth.isAdmin">
          <span class="mb-1 block text-xs font-medium text-slate-500">Tipo de item</span>
          <select v-model="entityType" class="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" @change="resetAndLoad">
            <option value="">Todos os itens</option>
            <option value="mapping_set">Documento e versão</option>
            <option value="mapping_entry">Vínculos</option>
            <option value="attachment">Arquivos</option>
            <option value="comment">Comentários</option>
          </select>
        </label>
      </div>
      <button
        v-if="auth.isAdmin && mappingSet.hasUnreviewedClientChanges"
        type="button"
        class="min-h-10 rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800"
        @click="reviewModalOpen = true"
      >
        Marcar alterações como revisadas
      </button>
    </div>

    <div
      v-if="mappingSet.hasUnreviewedClientChanges"
      class="mt-4 flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between"
    >
      <p>
        <span class="font-semibold">{{ auth.isAdmin ? 'Há alterações do cliente aguardando revisão.' : 'Suas alterações foram enviadas à equipe técnica.' }}</span>
        <span v-if="mappingSet.lastClientEditedAt"> Última edição em {{ formatDateTime(mappingSet.lastClientEditedAt) }}.</span>
      </p>
      <span v-if="!auth.isAdmin" class="shrink-0 text-xs font-medium">Você pode continuar complementando as informações.</span>
    </div>
    <div
      v-else-if="auth.isAdmin && mappingSet.lastReviewedAt"
      class="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
    >
      Alterações revisadas em {{ formatDateTime(mappingSet.lastReviewedAt) }}
      <span v-if="mappingSet.lastReviewedByEmail"> por {{ mappingSet.lastReviewedByEmail }}</span>.
    </div>

    <form class="mt-5 rounded-lg border border-slate-200 bg-white p-4" @submit.prevent="submitComment">
      <label class="text-sm font-medium text-slate-800">{{ auth.isAdmin ? 'Registrar comentário ou decisão' : 'Enviar dúvida ou observação' }}</label>
      <textarea
        v-model="comment"
        required
        maxlength="2000"
        rows="2"
        :placeholder="auth.isAdmin ? 'Ex.: Validamos este campo com o financeiro; usar o código A28.' : 'Ex.: usamos o código A28 neste cenário. Está correto?'"
        class="mt-2 w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
      ></textarea>
      <div class="mt-2 flex items-center justify-between gap-3">
        <p class="text-xs text-slate-500">{{ auth.isAdmin ? 'O comentário ficará visível para cliente e equipe técnica.' : 'A mensagem ficará registrada e visível para sua equipe e para a Chave Mestra.' }}</p>
        <button
          :disabled="submitting || !comment.trim()"
          class="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-50"
        >
          {{ submitting ? 'Registrando…' : 'Registrar' }}
        </button>
      </div>
    </form>

    <div v-if="loading && !changes.length" class="flex min-h-48 items-center justify-center text-sm text-slate-500">
      Carregando histórico…
    </div>
    <div v-else-if="errorMessage" class="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {{ errorMessage }}
      <button class="ml-2 font-medium underline" @click="loadHistory">Tentar novamente</button>
    </div>
    <div v-else-if="!changes.length" class="mt-5 rounded-lg border border-dashed border-slate-300 px-6 py-12 text-center">
      <p class="text-sm font-medium text-slate-700">Nenhuma alteração encontrada</p>
      <p class="mt-1 text-xs text-slate-500">Novas edições, publicações e decisões aparecerão aqui.</p>
    </div>

    <ol v-else class="mt-6 space-y-0">
      <li v-for="change in changes" :key="change.id" class="relative grid grid-cols-[28px_minmax(0,1fr)] gap-3 pb-6">
        <div class="relative flex justify-center">
          <span class="absolute bottom-[-1.5rem] top-5 w-px bg-slate-200 last:hidden"></span>
          <span
            class="relative mt-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white text-[10px] font-semibold ring-1 ring-slate-200"
            :class="changeTone(change)"
            aria-hidden="true"
          >{{ changeIcon(change) }}</span>
        </div>
        <article class="min-w-0 rounded-lg border border-slate-200 bg-white">
          <header class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0">
              <p class="text-sm font-medium leading-5 text-slate-900">{{ change.summary }}</p>
              <p class="mt-1 text-xs text-slate-500">
                {{ actorLabel(change) }} · {{ formatDateTime(change.createdAt) }}<template v-if="auth.isAdmin"> · revisão {{ change.mappingRevision }}</template>
              </p>
            </div>
            <span class="w-fit shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              {{ entityLabel(change.entityType) }}
            </span>
          </header>

          <details v-if="change.changedFields.length" class="border-t border-slate-100">
            <summary class="cursor-pointer px-4 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
              Ver {{ change.changedFields.length }} alteração{{ change.changedFields.length === 1 ? '' : 'ões' }}
            </summary>
            <dl class="divide-y divide-slate-100 border-t border-slate-100">
              <div v-for="field in change.changedFields" :key="field.field" class="grid gap-2 px-4 py-3 md:grid-cols-[160px_minmax(0,1fr)]">
                <dt class="text-xs font-medium text-slate-600">{{ fieldLabel(field.field) }}</dt>
                <dd class="min-w-0 text-xs text-slate-600">
                  <template v-if="field.field === 'contentMarkdown'">
                    {{ documentChangeSummary(field.before, field.after) }}
                  </template>
                  <template v-else>
                    <span class="break-words text-red-700 line-through decoration-red-300">{{ formatValue(field.before) }}</span>
                    <span class="mx-2 text-slate-300" aria-hidden="true">→</span>
                    <span class="break-words font-medium text-emerald-700">{{ formatValue(field.after) }}</span>
                  </template>
                </dd>
              </div>
            </dl>
          </details>
          <footer v-if="canRestore(change)" class="flex justify-end border-t border-slate-100 px-4 py-2.5">
            <button class="text-xs font-medium text-slate-600 hover:text-slate-950" @click="changeToRestore = change">
              Restaurar estado anterior
            </button>
          </footer>
        </article>
      </li>
    </ol>

    <div v-if="pagination.total > pagination.limit" class="flex items-center justify-between border-t border-slate-200 pt-4">
      <p class="text-xs text-slate-500">{{ pagination.total }} eventos registrados</p>
      <div class="flex gap-2">
        <button :disabled="pagination.offset === 0 || loading" class="rounded-md border border-slate-300 px-3 py-2 text-xs disabled:opacity-40" @click="previousPage">Anterior</button>
        <button :disabled="!pagination.hasMore || loading" class="rounded-md border border-slate-300 px-3 py-2 text-xs disabled:opacity-40" @click="nextPage">Próxima</button>
      </div>
    </div>

    <div v-if="reviewModalOpen && auth.isAdmin" class="fixed inset-0 z-[85] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-slate-950/55" @click="reviewModalOpen = false"></div>
      <form class="relative w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl" @submit.prevent="markReviewed">
        <h3 class="text-lg font-semibold text-slate-950">Concluir revisão</h3>
        <p class="mt-2 text-sm leading-6 text-slate-500">Confirme que as alterações do cliente foram verificadas. Você pode registrar uma orientação ou decisão.</p>
        <label class="mt-4 block text-sm font-medium text-slate-700">
          Observação <span class="font-normal text-slate-400">(opcional)</span>
          <textarea v-model="reviewNote" maxlength="2000" rows="3" class="mt-1.5 w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm"></textarea>
        </label>
        <p v-if="modalError" class="mt-3 text-sm text-red-700">{{ modalError }}</p>
        <div class="mt-5 flex justify-end gap-2">
          <button type="button" class="rounded-md border border-slate-300 px-3 py-2 text-sm" @click="reviewModalOpen = false">Cancelar</button>
          <button :disabled="submitting" class="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{{ submitting ? 'Concluindo…' : 'Concluir revisão' }}</button>
        </div>
      </form>
    </div>

    <div v-if="changeToRestore" class="fixed inset-0 z-[85] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-slate-950/55" @click="changeToRestore = null"></div>
      <div class="relative w-full max-w-md rounded-lg border border-amber-200 bg-white p-6 shadow-xl">
        <h3 class="text-lg font-semibold text-slate-950">Restaurar o estado anterior?</h3>
        <p class="mt-2 text-sm leading-6 text-slate-500">
          Uma nova entrada será criada no histórico. Nenhum evento anterior será apagado.
        </p>
        <p class="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{{ changeToRestore.summary }}</p>
        <p v-if="modalError" class="mt-3 text-sm text-red-700">{{ modalError }}</p>
        <div class="mt-5 flex justify-end gap-2">
          <button class="rounded-md border border-slate-300 px-3 py-2 text-sm" @click="changeToRestore = null">Cancelar</button>
          <button :disabled="submitting" class="rounded-md bg-amber-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" @click="restoreChange">{{ submitting ? 'Restaurando…' : 'Restaurar' }}</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useApi } from '@/composables/useApi'
import { useAuthStore } from '@/stores/auth'
import type { MappingChange, MappingSet } from '@/types'

const props = defineProps<{ mappingSet: MappingSet }>()
const emit = defineEmits<{ changed: [] }>()
const api = useApi()
const auth = useAuthStore()
const changes = ref<MappingChange[]>([])
const loading = ref(false)
const submitting = ref(false)
const errorMessage = ref('')
const modalError = ref('')
const search = ref('')
const actorRole = ref('')
const entityType = ref('')
const comment = ref('')
const reviewModalOpen = ref(false)
const reviewNote = ref('')
const changeToRestore = ref<MappingChange | null>(null)
const pagination = ref({ limit: 30, offset: 0, total: 0, hasMore: false })
let searchTimer: ReturnType<typeof setTimeout> | null = null

const loadHistory = async () => {
  loading.value = true
  errorMessage.value = ''
  try {
    const params = new URLSearchParams({
      limit: String(pagination.value.limit),
      offset: String(pagination.value.offset)
    })
    if (search.value.trim()) params.set('search', search.value.trim())
    if (actorRole.value) params.set('actorRole', actorRole.value)
    if (entityType.value) params.set('entityType', entityType.value)
    const data = await api.get<{
      changes: MappingChange[]
      pagination: typeof pagination.value
    }>(`/lambda/mappings/${props.mappingSet.id}/history?${params}`)
    changes.value = data.changes
    pagination.value = data.pagination
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Não foi possível carregar o histórico'
  } finally {
    loading.value = false
  }
}

const resetAndLoad = () => {
  pagination.value.offset = 0
  void loadHistory()
}
const scheduleLoad = () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(resetAndLoad, 300)
}
const previousPage = () => {
  pagination.value.offset = Math.max(0, pagination.value.offset - pagination.value.limit)
  void loadHistory()
}
const nextPage = () => {
  pagination.value.offset += pagination.value.limit
  void loadHistory()
}
const submitComment = async () => {
  if (!comment.value.trim()) return
  submitting.value = true
  errorMessage.value = ''
  try {
    await api.post(`/lambda/mappings/${props.mappingSet.id}/comments`, { message: comment.value.trim() })
    comment.value = ''
    pagination.value.offset = 0
    await loadHistory()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Não foi possível registrar o comentário'
  } finally {
    submitting.value = false
  }
}
const markReviewed = async () => {
  submitting.value = true
  modalError.value = ''
  try {
    await api.post(`/lambda/mappings/${props.mappingSet.id}/review`, {
      note: reviewNote.value.trim() || null,
      expectedRevision: props.mappingSet.revision
    })
    reviewModalOpen.value = false
    reviewNote.value = ''
    emit('changed')
    await loadHistory()
  } catch (error) {
    modalError.value = error instanceof Error ? error.message : 'Não foi possível concluir a revisão'
  } finally {
    submitting.value = false
  }
}
const restoreChange = async () => {
  if (!changeToRestore.value) return
  submitting.value = true
  modalError.value = ''
  try {
    await api.post(`/lambda/mappings/${props.mappingSet.id}/history/${changeToRestore.value.id}/restore`, {
      expectedRevision: props.mappingSet.revision
    })
    changeToRestore.value = null
    emit('changed')
    await loadHistory()
  } catch (error) {
    modalError.value = error instanceof Error ? error.message : 'Não foi possível restaurar a alteração'
  } finally {
    submitting.value = false
  }
}

const formatDateTime = (value: string) => new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
}).format(new Date(value))
const actorLabel = (change: MappingChange) => {
  if (change.actorEmail) return change.actorEmail
  if (change.actorRole === 'client') return auth.isAdmin ? 'Cliente' : 'Sua equipe'
  if (change.actorRole === 'admin') return 'Equipe técnica'
  return 'Sistema'
}
const entityLabel = (entity: MappingChange['entityType']) => ({
  mapping_set: 'Documento',
  mapping_entry: 'Vínculo',
  attachment: 'Arquivo',
  comment: 'Comentário'
}[entity])
const fieldLabel = (field: string) => ({
  name: 'Nome',
  description: 'Descrição',
  contentMarkdown: 'Documento',
  sourceSystem: 'Sistema de origem',
  targetSystem: 'Sistema de destino',
  processId: 'Processo relacionado',
  status: 'Status da versão',
  clientEditMode: 'Permissão do cliente',
  clientCanAddEntries: 'Inclusão de vínculos',
  clientCanDeleteEntries: 'Exclusão de vínculos',
  clientInstructions: 'Orientações',
  validationRules: 'Política de publicação',
  section: 'Seção',
  sourcePath: 'Origem',
  sourceType: 'Tipo de origem',
  targetPath: 'Destino',
  targetType: 'Tipo de destino',
  direction: 'Direção',
  transformation: 'Regra / transformação',
  fallbackValue: 'Valor padrão',
  isRequired: 'Obrigatório',
  notes: 'Observações',
  examples: 'Exemplos',
  mappingStatus: 'Situação',
  clientEditableFields: 'Campos liberados',
  entries: 'Vínculos',
  attachments: 'Arquivos'
}[field] || field)
const formatValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return 'vazio'
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (Array.isArray(value)) return value.length ? value.map(formatValue).join(', ') : 'nenhum'
  if (typeof value === 'object') {
    const text = JSON.stringify(value)
    return text.length > 180 ? `${text.slice(0, 180)}…` : text
  }
  const text = String(value)
  return text.length > 180 ? `${text.slice(0, 180)}…` : text
}
const documentChangeSummary = (before: unknown, after: unknown) => {
  const previousLines = typeof before === 'object' && before && 'lines' in before
    ? Number((before as { lines: unknown }).lines) || 0
    : String(before || '').split(/\r?\n/).filter(Boolean).length
  const nextLines = typeof after === 'object' && after && 'lines' in after
    ? Number((after as { lines: unknown }).lines) || 0
    : String(after || '').split(/\r?\n/).filter(Boolean).length
  const difference = nextLines - previousLines
  return `${previousLines} → ${nextLines} linhas${difference ? ` (${difference > 0 ? '+' : ''}${difference})` : ''}`
}
const changeTone = (change: MappingChange) => {
  if (change.action === 'delete' || change.action === 'archive') return 'bg-red-100 text-red-700'
  if (change.action === 'review' || change.action === 'publish') return 'bg-emerald-100 text-emerald-700'
  if (change.actorRole === 'client') return 'bg-amber-100 text-amber-800'
  if (change.action === 'comment') return 'bg-slate-200 text-slate-700'
  return 'bg-indigo-100 text-indigo-700'
}
const changeIcon = (change: MappingChange) => {
  if (change.action === 'delete') return '−'
  if (change.action === 'review' || change.action === 'publish') return '✓'
  if (change.action === 'comment') return '…'
  if (change.action === 'restore') return '↶'
  return '+'
}
const canRestore = (change: MappingChange) => Boolean(
  auth.isAdmin &&
  ['mapping_set', 'mapping_entry'].includes(change.entityType) &&
  change.canRestore &&
  !['restore', 'review', 'publish', 'archive', 'clone'].includes(change.action)
)

watch(() => props.mappingSet.id, resetAndLoad)
onMounted(loadHistory)
onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer)
})
</script>
