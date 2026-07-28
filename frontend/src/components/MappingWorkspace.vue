<template>
  <section>
    <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div class="min-w-0 flex-1">
        <label class="mb-1 block text-xs font-medium text-slate-500">Mapa de dados</label>
        <select v-model="selectedSetId" class="min-h-10 w-full max-w-xl rounded-md border border-slate-300 bg-white px-3 text-sm">
          <option value="">Selecione um mapeamento</option>
          <option v-for="mappingSet in mappingSets" :key="mappingSet.id" :value="String(mappingSet.id)">
            {{ mappingSet.name }} · {{ mappingSet.sourceSystem }} → {{ mappingSet.targetSystem }} · v{{ mappingSet.version }}
          </option>
        </select>
      </div>
      <div class="flex flex-wrap gap-2">
        <button v-if="selectedSet" class="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50" @click="exportCsv">Exportar CSV</button>
        <button v-if="auth.isAdmin" class="min-h-10 rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800" @click="openSetModal">Novo mapa</button>
      </div>
    </div>

    <div v-if="loading" class="rounded-lg border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">Carregando mapeamentos…</div>
    <div v-else-if="errorMessage" class="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{{ errorMessage }}</div>
    <div v-else-if="!mappingSets.length" class="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <h3 class="font-semibold text-slate-900">Nenhum de-para disponível</h3>
      <p class="mt-1 text-sm text-slate-500">{{ auth.isAdmin ? 'Crie o primeiro mapa para documentar a transformação entre os sistemas.' : 'A equipe ainda não publicou o mapeamento desta automação.' }}</p>
      <button v-if="auth.isAdmin" class="mt-4 rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white" @click="openSetModal">Criar mapa</button>
    </div>

    <template v-else-if="selectedSet">
      <header class="mb-4 border-y border-slate-200 py-4">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-semibold text-slate-950">{{ selectedSet.name }}</h3>
              <span :class="setStatusClass(selectedSet.status)" class="rounded-full px-2 py-0.5 text-xs font-medium">{{ setStatusLabel(selectedSet.status) }}</span>
              <span class="text-xs text-slate-400">versão {{ selectedSet.version }}</span>
            </div>
            <p class="mt-1 text-sm text-slate-500">{{ selectedSet.description || `${selectedSet.sourceSystem} para ${selectedSet.targetSystem}` }}</p>
            <p v-if="selectedSet.processTitle" class="mt-1 text-xs text-slate-400">Processo relacionado: {{ selectedSet.processTitle }}</p>
          </div>
          <div v-if="auth.isAdmin" class="flex flex-wrap gap-2">
            <button v-if="selectedSet.status !== 'draft'" class="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium" @click="cloneSet">Criar nova versão</button>
            <button v-if="selectedSet.status === 'draft'" class="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800" @click="publishSet">Publicar para o cliente</button>
            <button v-if="selectedSet.status === 'draft'" class="rounded-md bg-slate-950 px-3 py-2 text-xs font-medium text-white" @click="openEntryModal()">+ Adicionar campo</button>
          </div>
        </div>
      </header>

      <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <input v-model="entrySearch" type="search" placeholder="Buscar campo, transformação ou observação" class="min-h-10 w-full max-w-xl rounded-md border border-slate-300 bg-white px-3 text-sm" />
        <p class="text-xs text-slate-500">{{ filteredEntries.length }} campo{{ filteredEntries.length === 1 ? '' : 's' }}</p>
      </div>

      <div class="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table class="w-full min-w-[900px] text-left">
          <thead class="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
            <tr><th class="px-4 py-3">Origem</th><th class="px-4 py-3">Regra</th><th class="px-4 py-3">Destino</th><th class="px-4 py-3">Obrigatório</th><th class="px-4 py-3">Observações</th><th v-if="auth.isAdmin && selectedSet.status === 'draft'" class="w-24 px-4 py-3"></th></tr>
          </thead>
          <tbody class="divide-y divide-slate-100 text-sm">
            <tr v-for="entry in filteredEntries" :key="entry.id" class="align-top">
              <td class="px-4 py-3"><code class="font-mono text-xs text-slate-900">{{ entry.sourcePath }}</code><p v-if="entry.sourceType" class="mt-1 text-xs text-slate-400">{{ entry.sourceType }}</p></td>
              <td class="px-4 py-3"><p class="max-w-xs whitespace-pre-wrap text-xs leading-5 text-slate-600">{{ entry.transformation || 'Cópia direta' }}</p><p v-if="entry.fallbackValue" class="mt-1 text-xs text-slate-400">Padrão: {{ entry.fallbackValue }}</p></td>
              <td class="px-4 py-3"><code class="font-mono text-xs text-slate-900">{{ entry.targetPath }}</code><p v-if="entry.targetType" class="mt-1 text-xs text-slate-400">{{ entry.targetType }}</p></td>
              <td class="px-4 py-3"><span :class="entry.isRequired ? 'text-red-700' : 'text-slate-400'" class="text-xs font-medium">{{ entry.isRequired ? 'Sim' : 'Não' }}</span></td>
              <td class="px-4 py-3"><p class="max-w-xs whitespace-pre-wrap text-xs leading-5 text-slate-500">{{ entry.notes || '—' }}</p></td>
              <td v-if="auth.isAdmin && selectedSet.status === 'draft'" class="px-4 py-3"><div class="flex gap-2"><button class="text-xs font-medium text-indigo-600" @click="openEntryModal(entry)">Editar</button><button class="text-xs font-medium text-red-600" @click="requestDeleteEntry(entry)">Excluir</button></div></td>
            </tr>
            <tr v-if="!filteredEntries.length"><td :colspan="auth.isAdmin && selectedSet.status === 'draft' ? 6 : 5" class="px-5 py-12 text-center text-sm text-slate-500">Nenhum campo encontrado.</td></tr>
          </tbody>
        </table>
      </div>
    </template>

    <div v-if="setModalOpen" class="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-slate-950/55" @click="setModalOpen = false"></div>
      <form class="relative w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-xl" @submit.prevent="createSet">
        <h3 class="text-lg font-semibold text-slate-950">Novo mapa de dados</h3>
        <p class="mt-1 text-sm text-slate-500">Defina a origem, o destino e o contexto desta transformação.</p>
        <div class="mt-5 space-y-4">
          <div><label class="mb-1.5 block text-sm font-medium">Nome</label><input v-model="setForm.name" required maxlength="160" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm" /></div>
          <div class="grid gap-4 sm:grid-cols-2"><div><label class="mb-1.5 block text-sm font-medium">Sistema de origem</label><input v-model="setForm.sourceSystem" required maxlength="160" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm" /></div><div><label class="mb-1.5 block text-sm font-medium">Sistema de destino</label><input v-model="setForm.targetSystem" required maxlength="160" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm" /></div></div>
          <div><label class="mb-1.5 block text-sm font-medium">Descrição</label><textarea v-model="setForm.description" rows="3" maxlength="3000" class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm"></textarea></div>
        </div>
        <p v-if="modalError" class="mt-3 text-sm text-red-700">{{ modalError }}</p>
        <div class="mt-5 flex justify-end gap-2"><button type="button" class="rounded-md border border-slate-300 px-3 py-2 text-sm" @click="setModalOpen = false">Cancelar</button><button :disabled="saving" class="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{{ saving ? 'Criando…' : 'Criar mapa' }}</button></div>
      </form>
    </div>

    <div v-if="entryModalOpen" class="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-slate-950/55" @click="entryModalOpen = false"></div>
      <form class="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-xl" @submit.prevent="saveEntry">
        <h3 class="text-lg font-semibold text-slate-950">{{ entryForm.id ? 'Editar campo' : 'Adicionar campo' }}</h3>
        <div class="mt-5 grid gap-4 sm:grid-cols-2">
          <div><label class="mb-1.5 block text-sm font-medium">Caminho de origem</label><input v-model="entryForm.sourcePath" required maxlength="500" placeholder="pedido.cliente.cnpj" class="w-full rounded-md border border-slate-300 px-3 py-2.5 font-mono text-sm" /></div>
          <div><label class="mb-1.5 block text-sm font-medium">Tipo de origem</label><input v-model="entryForm.sourceType" maxlength="80" placeholder="string" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm" /></div>
          <div><label class="mb-1.5 block text-sm font-medium">Caminho de destino</label><input v-model="entryForm.targetPath" required maxlength="500" placeholder="customer.document" class="w-full rounded-md border border-slate-300 px-3 py-2.5 font-mono text-sm" /></div>
          <div><label class="mb-1.5 block text-sm font-medium">Tipo de destino</label><input v-model="entryForm.targetType" maxlength="80" placeholder="string" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm" /></div>
          <div class="sm:col-span-2"><label class="mb-1.5 block text-sm font-medium">Transformação</label><textarea v-model="entryForm.transformation" rows="3" maxlength="5000" placeholder="Remover pontuação e preencher com zeros à esquerda até 14 caracteres." class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm"></textarea></div>
          <div><label class="mb-1.5 block text-sm font-medium">Valor padrão</label><input v-model="entryForm.fallbackValue" maxlength="2000" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm" /></div>
          <div><label class="mb-1.5 block text-sm font-medium">Direção</label><select v-model="entryForm.direction" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="source_to_target">Origem → destino</option><option value="target_to_source">Destino → origem</option><option value="bidirectional">Bidirecional</option></select></div>
          <div class="sm:col-span-2"><label class="mb-1.5 block text-sm font-medium">Observações</label><textarea v-model="entryForm.notes" rows="3" maxlength="3000" class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm"></textarea></div>
          <label class="sm:col-span-2 flex items-center gap-2 text-sm font-medium"><input v-model="entryForm.isRequired" type="checkbox" class="h-4 w-4 rounded border-slate-300" /> Campo obrigatório</label>
        </div>
        <p v-if="modalError" class="mt-3 text-sm text-red-700">{{ modalError }}</p>
        <div class="mt-5 flex justify-end gap-2"><button type="button" class="rounded-md border border-slate-300 px-3 py-2 text-sm" @click="entryModalOpen = false">Cancelar</button><button :disabled="saving" class="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{{ saving ? 'Salvando…' : 'Salvar campo' }}</button></div>
      </form>
    </div>

    <div v-if="entryToDelete" class="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-slate-950/55" @click="entryToDelete = null"></div>
      <div class="relative w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
        <h3 class="text-lg font-semibold text-slate-950">Excluir campo do mapa?</h3>
        <p class="mt-2 text-sm text-slate-500">O vínculo {{ entryToDelete.sourcePath }} → {{ entryToDelete.targetPath }} será removido desta versão.</p>
        <div class="mt-5 flex justify-end gap-2"><button class="rounded-md border border-slate-300 px-3 py-2 text-sm" @click="entryToDelete = null">Cancelar</button><button :disabled="saving" class="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" @click="deleteEntry">Excluir campo</button></div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useApi } from '@/composables/useApi'
import { useAuthStore } from '@/stores/auth'
import type { MappingEntry, MappingSet } from '@/types'

const props = defineProps<{ integrationId: number }>()
const api = useApi()
const auth = useAuthStore()
const mappingSets = ref<MappingSet[]>([])
const selectedSetId = ref('')
const entrySearch = ref('')
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')
const modalError = ref('')
const setModalOpen = ref(false)
const entryModalOpen = ref(false)
const entryToDelete = ref<MappingEntry | null>(null)
const setForm = ref({ name: '', sourceSystem: '', targetSystem: '', description: '' })
const emptyEntryForm = () => ({
  id: null as number | null, sourcePath: '', sourceType: '', targetPath: '', targetType: '',
  direction: 'source_to_target' as MappingEntry['direction'], transformation: '', fallbackValue: '',
  isRequired: false, notes: ''
})
const entryForm = ref(emptyEntryForm())

const selectedSet = computed(() => mappingSets.value.find(item => String(item.id) === selectedSetId.value) || null)
const filteredEntries = computed(() => {
  const search = entrySearch.value.trim().toLocaleLowerCase('pt-BR')
  if (!selectedSet.value || !search) return selectedSet.value?.entries || []
  return selectedSet.value.entries.filter(entry =>
    [entry.sourcePath, entry.targetPath, entry.transformation, entry.notes]
      .some(value => value?.toLocaleLowerCase('pt-BR').includes(search))
  )
})
const setStatusLabel = (status: MappingSet['status']) => ({ draft: 'Rascunho', published: 'Publicado', archived: 'Arquivado' }[status])
const setStatusClass = (status: MappingSet['status']) => ({
  draft: 'bg-amber-100 text-amber-800', published: 'bg-emerald-100 text-emerald-800', archived: 'bg-slate-100 text-slate-600'
}[status])

const fetchMappings = async (preserveSelection = true) => {
  loading.value = true
  errorMessage.value = ''
  const previousId = preserveSelection ? selectedSetId.value : ''
  try {
    const data = await api.get<{ mappingSets: MappingSet[] }>(`/lambda/integrations/${props.integrationId}/mappings`)
    mappingSets.value = data.mappingSets
    selectedSetId.value = data.mappingSets.some(item => String(item.id) === previousId)
      ? previousId
      : (data.mappingSets[0] ? String(data.mappingSets[0].id) : '')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Não foi possível carregar os mapeamentos'
  } finally {
    loading.value = false
  }
}
const openSetModal = () => {
  setForm.value = { name: '', sourceSystem: '', targetSystem: '', description: '' }
  modalError.value = ''
  setModalOpen.value = true
}
const createSet = async () => {
  saving.value = true
  modalError.value = ''
  try {
    const data = await api.post<{ mappingSetId: number }>(`/lambda/integrations/${props.integrationId}/mappings`, setForm.value)
    setModalOpen.value = false
    await fetchMappings(false)
    selectedSetId.value = String(data.mappingSetId)
  } catch (error) {
    modalError.value = error instanceof Error ? error.message : 'Não foi possível criar o mapa'
  } finally {
    saving.value = false
  }
}
const openEntryModal = (entry?: MappingEntry) => {
  entryForm.value = entry ? {
    id: entry.id, sourcePath: entry.sourcePath, sourceType: entry.sourceType || '',
    targetPath: entry.targetPath, targetType: entry.targetType || '', direction: entry.direction,
    transformation: entry.transformation || '', fallbackValue: entry.fallbackValue || '',
    isRequired: entry.isRequired, notes: entry.notes || ''
  } : emptyEntryForm()
  modalError.value = ''
  entryModalOpen.value = true
}
const saveEntry = async () => {
  if (!selectedSet.value) return
  saving.value = true
  modalError.value = ''
  const payload = {
    sourcePath: entryForm.value.sourcePath, sourceType: entryForm.value.sourceType || null,
    targetPath: entryForm.value.targetPath, targetType: entryForm.value.targetType || null,
    direction: entryForm.value.direction, transformation: entryForm.value.transformation || null,
    fallbackValue: entryForm.value.fallbackValue || null, isRequired: entryForm.value.isRequired,
    notes: entryForm.value.notes || null
  }
  try {
    if (entryForm.value.id) await api.patch(`/lambda/mappings/${selectedSet.value.id}/entries/${entryForm.value.id}`, payload)
    else await api.post(`/lambda/mappings/${selectedSet.value.id}/entries`, payload)
    entryModalOpen.value = false
    await fetchMappings()
  } catch (error) {
    modalError.value = error instanceof Error ? error.message : 'Não foi possível salvar o campo'
  } finally {
    saving.value = false
  }
}
const publishSet = async () => {
  if (!selectedSet.value) return
  saving.value = true
  try {
    await api.patch(`/lambda/mappings/${selectedSet.value.id}`, { status: 'published' })
    await fetchMappings()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Não foi possível publicar o mapa'
  } finally {
    saving.value = false
  }
}
const cloneSet = async () => {
  if (!selectedSet.value) return
  saving.value = true
  try {
    const data = await api.post<{ mappingSetId: number }>(`/lambda/mappings/${selectedSet.value.id}/clone`)
    await fetchMappings(false)
    selectedSetId.value = String(data.mappingSetId)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Não foi possível duplicar o mapa'
  } finally {
    saving.value = false
  }
}
const requestDeleteEntry = (entry: MappingEntry) => { entryToDelete.value = entry }
const deleteEntry = async () => {
  if (!selectedSet.value || !entryToDelete.value) return
  saving.value = true
  try {
    await api.del(`/lambda/mappings/${selectedSet.value.id}/entries/${entryToDelete.value.id}`)
    entryToDelete.value = null
    await fetchMappings()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Não foi possível excluir o campo'
  } finally {
    saving.value = false
  }
}
const exportCsv = () => {
  if (!selectedSet.value) return
  const rows = [
    ['Origem', 'Tipo origem', 'Transformação', 'Valor padrão', 'Destino', 'Tipo destino', 'Obrigatório', 'Observações'],
    ...selectedSet.value.entries.map(entry => [
      entry.sourcePath, entry.sourceType || '', entry.transformation || '', entry.fallbackValue || '',
      entry.targetPath, entry.targetType || '', entry.isRequired ? 'Sim' : 'Não', entry.notes || ''
    ])
  ]
  const csv = '\uFEFF' + rows.map(row => row.map(value => `"${value.replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `de-para-${selectedSet.value.name.toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g, '-')}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

watch(() => props.integrationId, () => void fetchMappings(false))
onMounted(() => void fetchMappings(false))
</script>
