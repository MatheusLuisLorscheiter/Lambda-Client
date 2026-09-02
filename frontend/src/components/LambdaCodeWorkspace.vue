<template>
  <div v-if="modelValue" class="fixed inset-0 z-[80] flex items-center justify-center p-3">
    <div class="absolute inset-0 bg-slate-950/70" @click="close"></div>
    <section class="relative flex h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
      <header class="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <div class="flex flex-wrap items-center gap-2"><h2 class="text-lg font-semibold text-slate-900">Editor da Lambda</h2><span class="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">{{ integration.functionName }}</span></div>
          <p class="mt-1 text-xs text-slate-500">{{ integration.region }}<span v-if="snapshot"> · {{ snapshot.runtime || 'runtime não informado' }} · handler {{ snapshot.handler || 'não informado' }} · SHA {{ snapshot.codeSha256.slice(0, 12) }}</span></p>
        </div>
        <div class="flex gap-2"><button class="rounded-md border border-slate-300 px-3 py-2 text-sm" :disabled="loading" @click="loadWorkspace">Recarregar da AWS</button><button class="rounded p-2 text-slate-500 hover:bg-slate-100" @click="close">✕</button></div>
      </header>

      <div v-if="loading" class="flex flex-1 items-center justify-center text-sm text-slate-500">Baixando e preparando o pacote da função...</div>
      <div v-else-if="error" class="m-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{{ error }}</div>
      <div v-else-if="snapshot" class="grid min-h-0 flex-1 grid-cols-1 grid-rows-[160px_minmax(320px,1fr)_220px] overflow-auto lg:grid-cols-[230px_minmax(0,1fr)_320px] lg:grid-rows-1 lg:overflow-hidden">
        <aside class="min-h-0 overflow-auto border-r border-slate-200 bg-slate-50 p-3">
          <p class="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Arquivos editáveis ({{ fileNames.length }})</p>
          <button v-for="name in fileNames" :key="name" class="mb-0.5 block w-full truncate rounded px-2 py-1.5 text-left font-mono text-xs" :class="name === selectedFile ? 'bg-indigo-100 text-indigo-800' : changedFiles.includes(name) ? 'bg-amber-50 text-amber-800' : 'text-slate-700 hover:bg-slate-200'" @click="selectedFile = name">
            <span v-if="changedFiles.includes(name)" class="mr-1">●</span>{{ name }}
          </button>
          <p v-if="snapshot.excludedFiles.length" class="mt-4 px-2 text-[11px] leading-4 text-slate-500">{{ snapshot.excludedFiles.length }} arquivo(s) binário(s), grande(s) ou de dependência foram preservados no pacote, mas não aparecem no editor.</p>
        </aside>

        <main class="flex min-h-0 min-w-0 flex-col bg-slate-950">
          <div class="flex min-h-10 items-center justify-between border-b border-slate-800 px-4 text-xs text-slate-300"><span class="truncate font-mono">{{ selectedFile || 'Selecione um arquivo' }}</span><span v-if="selectedFile && changedFiles.includes(selectedFile)" class="text-amber-300">Modificado</span></div>
          <textarea v-if="selectedFile" v-model="workingFiles[selectedFile]" spellcheck="false" class="min-h-0 flex-1 resize-none border-0 bg-slate-950 p-4 font-mono text-[13px] leading-5 text-slate-100 outline-none"></textarea>
          <div v-else class="flex flex-1 items-center justify-center text-sm text-slate-500">Nenhum arquivo de texto editável.</div>
          <div class="flex flex-wrap items-end gap-3 border-t border-slate-800 bg-slate-900 px-4 py-3">
            <label class="min-w-64 flex-1"><span class="mb-1 block text-[11px] font-medium text-slate-300">Resumo obrigatório da alteração</span><input v-model="summary" maxlength="1000" placeholder="Ex.: corrige regra de vencimento da transportadora" class="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500" /></label>
            <button class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40" :disabled="saving || !summary.trim() || !changedFiles.length" @click="saveRevision">{{ saving ? 'Salvando...' : `Salvar revisão (${changedFiles.length})` }}</button>
          </div>
        </main>

        <aside class="min-h-0 overflow-auto border-l border-slate-200 p-4">
          <div class="flex items-center justify-between"><h3 class="text-sm font-semibold text-slate-900">Revisões</h3><span class="text-xs text-slate-500">aprovação obrigatória</span></div>
          <p class="mt-2 rounded-md bg-indigo-50 p-2 text-xs leading-4 text-indigo-800">Agentes podem ler e propor alterações via MCP. Somente um administrador pode aprovar e publicar na AWS.</p>
          <div class="mt-4 space-y-3">
            <article v-for="revision in revisions" :key="revision.id" class="rounded-lg border border-slate-200 p-3">
              <div class="flex items-center justify-between gap-2"><span class="text-sm font-semibold text-slate-800">Revisão {{ revision.revision }}</span><span class="rounded-full px-2 py-0.5 text-[10px] font-semibold" :class="statusClass(revision.status)">{{ statusLabel(revision.status) }}</span></div>
              <p class="mt-2 text-xs leading-4 text-slate-600">{{ revision.summary }}</p>
              <p class="mt-2 text-[11px] text-slate-500">{{ revision.changedFiles.length }} arquivo(s) · {{ formatDate(revision.createdAt) }}</p>
              <p v-if="revision.errorMessage" class="mt-2 rounded bg-red-50 p-2 text-[11px] text-red-700">{{ revision.errorMessage }}</p>
              <div v-if="revision.files" class="mt-2 space-y-2">
                <details v-for="(content, name) in revision.files" :key="name" class="rounded border border-slate-200 bg-slate-50">
                  <summary class="cursor-pointer px-2 py-1 font-mono text-[10px] text-slate-700">{{ name }}</summary>
                  <pre class="max-h-48 overflow-auto border-t border-slate-200 p-2 text-[10px] leading-4 text-slate-700">{{ content }}</pre>
                </details>
                <p v-if="revision.deletedFiles.length" class="text-[10px] text-red-600">Removidos: {{ revision.deletedFiles.join(', ') }}</p>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <button v-if="!revision.files" class="rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600" @click="inspectRevision(revision)">Ver conteúdo</button>
                <button v-if="revision.status === 'draft'" class="rounded border border-indigo-200 px-2 py-1 text-[11px] font-medium text-indigo-700" @click="transition(revision, 'request-review')">Solicitar revisão</button>
                <button v-if="revision.status === 'pending_review'" class="rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white" @click="transition(revision, 'approve')">Aprovar</button>
                <button v-if="revision.status === 'pending_review'" class="rounded border border-red-200 px-2 py-1 text-[11px] font-medium text-red-600" @click="reject(revision)">Rejeitar</button>
                <button v-if="revision.status === 'approved' || revision.status === 'failed'" class="rounded bg-slate-950 px-2 py-1 text-[11px] font-medium text-white" @click="publish(revision)">{{ revision.status === 'failed' ? 'Tentar novamente' : 'Publicar na AWS' }}</button>
              </div>
            </article>
            <p v-if="!revisions.length" class="py-6 text-center text-xs text-slate-500">Nenhuma revisão criada.</p>
          </div>
        </aside>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useApi } from '@/composables/useApi'
import type { Integration, LambdaSourceRevision, LambdaSourceRevisionStatus, LambdaSourceSnapshot } from '@/types'

const props = defineProps<{ modelValue: boolean; integration: Integration }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const api = useApi()
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const snapshot = ref<LambdaSourceSnapshot | null>(null)
const originalFiles = ref<Record<string, string>>({})
const workingFiles = ref<Record<string, string>>({})
const selectedFile = ref('')
const summary = ref('')
const revisions = ref<LambdaSourceRevision[]>([])

const fileNames = computed(() => Object.keys(workingFiles.value).sort((a, b) => a.localeCompare(b)))
const changedFiles = computed(() => fileNames.value.filter(name => workingFiles.value[name] !== originalFiles.value[name]))
const close = () => emit('update:modelValue', false)
const formatDate = (value: string) => new Date(value).toLocaleString('pt-BR')
const statusLabel = (status: LambdaSourceRevisionStatus) => ({ draft: 'Rascunho', pending_review: 'Em revisão', approved: 'Aprovada', publishing: 'Publicando', published: 'Publicada', rejected: 'Rejeitada', failed: 'Falhou' }[status])
const statusClass = (status: LambdaSourceRevisionStatus) => status === 'published' ? 'bg-emerald-100 text-emerald-700' : status === 'approved' ? 'bg-blue-100 text-blue-700' : status === 'pending_review' ? 'bg-amber-100 text-amber-700' : ['failed', 'rejected'].includes(status) ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'

const fetchRevisions = async () => {
  const data = await api.get<{ revisions: LambdaSourceRevision[] }>(`/lambda/integrations/${props.integration.id}/source/revisions`)
  revisions.value = data.revisions
}

const loadWorkspace = async () => {
  loading.value = true
  error.value = ''
  try {
    const [source] = await Promise.all([
      api.get<LambdaSourceSnapshot>(`/lambda/integrations/${props.integration.id}/source`),
      fetchRevisions()
    ])
    snapshot.value = source
    originalFiles.value = { ...source.files }
    workingFiles.value = { ...source.files }
    selectedFile.value = Object.keys(source.files).sort()[0] || ''
    summary.value = ''
  } catch (caught) { error.value = caught instanceof Error ? caught.message : 'Não foi possível abrir o código.' } finally { loading.value = false }
}

const saveRevision = async () => {
  if (!snapshot.value) return
  saving.value = true
  try {
    const files = Object.fromEntries(changedFiles.value.map(name => [name, workingFiles.value[name]]))
    await api.post(`/lambda/integrations/${props.integration.id}/source/revisions`, { baseCodeSha256: snapshot.value.codeSha256, files, deletedFiles: [], summary: summary.value.trim() })
    summary.value = ''
    await fetchRevisions()
  } catch (caught) { window.alert(caught instanceof Error ? caught.message : 'Falha ao salvar a revisão.') } finally { saving.value = false }
}

const inspectRevision = async (revision: LambdaSourceRevision) => {
  try {
    const data = await api.get<{ revision: LambdaSourceRevision }>(`/lambda/integrations/${props.integration.id}/source/revisions/${revision.id}`)
    revisions.value = revisions.value.map(item => item.id === revision.id ? data.revision : item)
  } catch (caught) { window.alert(caught instanceof Error ? caught.message : 'Falha ao carregar a revisão.') }
}

const transition = async (revision: LambdaSourceRevision, action: 'request-review' | 'approve') => {
  try { await api.post(`/lambda/integrations/${props.integration.id}/source/revisions/${revision.id}/${action}`, action === 'approve' ? { note: 'Aprovada no workspace da Lambda Pulse.' } : undefined); await fetchRevisions() } catch (caught) { window.alert(caught instanceof Error ? caught.message : 'Falha ao atualizar a revisão.') }
}

const reject = async (revision: LambdaSourceRevision) => {
  const note = window.prompt('Motivo da rejeição:')?.trim()
  if (!note) return
  try { await api.post(`/lambda/integrations/${props.integration.id}/source/revisions/${revision.id}/reject`, { note }); await fetchRevisions() } catch (caught) { window.alert(caught instanceof Error ? caught.message : 'Falha ao rejeitar a revisão.') }
}

const publish = async (revision: LambdaSourceRevision) => {
  if (!window.confirm(`Publicar a revisão ${revision.revision} diretamente na função ${props.integration.functionName}? A AWS criará uma nova versão imutável.`)) return
  try {
    await api.post(`/lambda/integrations/${props.integration.id}/source/revisions/${revision.id}/publish`)
    await loadWorkspace()
  } catch (caught) { window.alert(caught instanceof Error ? caught.message : 'Falha ao publicar na AWS.'); await fetchRevisions() }
}

watch(() => props.modelValue, value => { if (value) void loadWorkspace() })
</script>
