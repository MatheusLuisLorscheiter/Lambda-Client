<template>
  <section class="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div class="flex items-center gap-2">
          <h3 class="text-sm font-semibold text-slate-900">Conexões AWS reutilizáveis</h3>
          <span class="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">{{ connections.length }}</span>
        </div>
        <p class="mt-1 max-w-3xl text-xs leading-5 text-slate-600">
          Cadastre uma credencial por conta e empresa. Depois descubra e selecione as funções que devem aparecer no Lambda Pulse.
        </p>
      </div>
      <button class="min-h-9 shrink-0 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700" @click="openCreate">
        + Conectar conta AWS
      </button>
    </div>

    <div v-if="loading" class="mt-4 text-sm text-slate-500">Carregando conexões...</div>
    <div v-else-if="connections.length" class="mt-4 grid gap-3 lg:grid-cols-2">
      <article v-for="connection in connections" :key="connection.id" class="rounded-lg border border-slate-200 bg-white p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <p class="truncate text-sm font-semibold text-slate-900">{{ connection.name }}</p>
              <span class="rounded-full px-2 py-0.5 text-[11px] font-medium" :class="connection.lastCheckStatus === 'healthy' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'">
                {{ connection.lastCheckStatus === 'healthy' ? 'Validada' : 'Não validada' }}
              </span>
            </div>
            <p class="mt-1 text-xs text-slate-500">{{ connection.companyName }} · {{ connection.defaultRegion }} · chave {{ connection.accessKeyHint }}</p>
            <p class="mt-1 text-xs text-slate-500">Conta AWS {{ connection.accountId || 'a confirmar' }} · {{ connection.integrationCount }} função(ões)</p>
          </div>
        </div>
        <p v-if="connection.lastCheckMessage" class="mt-2 text-xs text-slate-500">{{ connection.lastCheckMessage }}</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button class="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700" @click="discover(connection)">Selecionar funções</button>
          <button class="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700" :disabled="testingId === connection.id" @click="testConnection(connection)">
            {{ testingId === connection.id ? 'Testando...' : 'Testar' }}
          </button>
          <button class="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 disabled:opacity-40" :disabled="connection.integrationCount > 0" @click="removeConnection(connection)">Excluir</button>
        </div>
      </article>
    </div>
    <div v-else class="mt-4 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
      Nenhuma conexão AWS compartilhada cadastrada.
    </div>

    <div v-if="createVisible" class="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-slate-950/60" @click="createVisible = false"></div>
      <form class="relative w-full max-w-2xl rounded-xl bg-white p-6 shadow-2xl" @submit.prevent="createConnection">
        <div class="flex items-start justify-between gap-4">
          <div><h3 class="text-lg font-semibold text-slate-900">Conectar conta AWS</h3><p class="mt-1 text-sm text-slate-500">A chave fica criptografada e pode atender todas as funções autorizadas dessa empresa.</p></div>
          <button type="button" class="rounded p-2 text-slate-500 hover:bg-slate-100" @click="createVisible = false">✕</button>
        </div>
        <div class="mt-5 grid gap-4 md:grid-cols-2">
          <label class="block"><span class="mb-1 block text-sm font-medium text-slate-700">Nome da conexão</span><input v-model="form.name" required maxlength="120" placeholder="Produção CMG" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm" /></label>
          <label class="block"><span class="mb-1 block text-sm font-medium text-slate-700">Empresa</span><select v-model.number="form.companyId" required class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm"><option :value="null" disabled>Selecione</option><option v-for="company in companies" :key="company.id" :value="company.id">{{ company.name }}</option></select></label>
          <label class="block"><span class="mb-1 block text-sm font-medium text-slate-700">Região padrão</span><input v-model="form.defaultRegion" required placeholder="us-east-2" class="w-full rounded-md border border-slate-300 px-3 py-2.5 font-mono text-sm" /></label>
          <div></div>
          <label class="block"><span class="mb-1 block text-sm font-medium text-slate-700">Access Key ID</span><input v-model="form.accessKeyId" required autocomplete="off" class="w-full rounded-md border border-slate-300 px-3 py-2.5 font-mono text-sm" /></label>
          <label class="block"><span class="mb-1 block text-sm font-medium text-slate-700">Secret Access Key</span><input v-model="form.secretAccessKey" required type="password" autocomplete="new-password" class="w-full rounded-md border border-slate-300 px-3 py-2.5 font-mono text-sm" /></label>
        </div>
        <p class="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">A validação consulta a identidade AWS antes de salvar. A chave secreta nunca é devolvida pela API.</p>
        <div class="mt-5 flex justify-end gap-2"><button type="button" class="rounded-md border border-slate-300 px-4 py-2 text-sm" @click="createVisible = false">Cancelar</button><button :disabled="saving" class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{{ saving ? 'Validando...' : 'Validar e conectar' }}</button></div>
      </form>
    </div>

    <div v-if="discoverVisible" class="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-slate-950/60" @click="discoverVisible = false"></div>
      <div class="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white p-6 shadow-2xl">
        <div class="flex items-start justify-between gap-4">
          <div><h3 class="text-lg font-semibold text-slate-900">Selecionar funções</h3><p class="mt-1 text-sm text-slate-500">{{ activeConnection?.name }} · importação para {{ activeConnection?.companyName }}</p></div>
          <button class="rounded p-2 text-slate-500 hover:bg-slate-100" @click="discoverVisible = false">✕</button>
        </div>
        <div class="mt-4 flex flex-wrap items-end gap-3"><label><span class="mb-1 block text-xs font-medium text-slate-600">Região</span><input v-model="discoverRegion" class="rounded-md border border-slate-300 px-3 py-2 font-mono text-sm" /></label><button class="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium" :disabled="discoverLoading" @click="loadFunctions">{{ discoverLoading ? 'Consultando...' : 'Atualizar lista' }}</button><label class="min-w-64 flex-1"><span class="mb-1 block text-xs font-medium text-slate-600">Filtrar</span><input v-model="functionSearch" type="search" placeholder="Nome ou runtime" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" /></label></div>
        <div class="mt-4 min-h-32 flex-1 overflow-auto rounded-lg border border-slate-200">
          <label v-for="fn in filteredFunctions" :key="fn.functionArn" class="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0" :class="fn.importedWithConnectionId ? 'bg-slate-50 opacity-70' : 'hover:bg-indigo-50/40'">
            <input v-model="selectedFunctions" type="checkbox" :value="fn.functionName" :disabled="Boolean(fn.importedWithConnectionId)" class="h-4 w-4 rounded border-slate-300 text-indigo-600" />
            <span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium text-slate-800">{{ fn.functionName }}</span><span class="text-xs text-slate-500">{{ fn.runtime || 'runtime não informado' }} · {{ fn.memorySize }} MB · timeout {{ fn.timeout }}s</span></span>
            <span v-if="fn.importedWithConnectionId" class="text-xs font-medium text-emerald-700">Já conectada</span>
            <span v-else-if="fn.importedIntegrationId" class="text-xs font-medium text-amber-700">Migrar credencial existente</span>
          </label>
          <p v-if="!discoverLoading && !filteredFunctions.length" class="px-4 py-10 text-center text-sm text-slate-500">Nenhuma função encontrada.</p>
        </div>
        <div class="mt-5 flex items-center justify-between gap-3"><p class="text-xs text-slate-500">{{ selectedFunctions.length }} selecionada(s)</p><div class="flex gap-2"><button class="rounded-md border border-slate-300 px-4 py-2 text-sm" @click="discoverVisible = false">Fechar</button><button class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" :disabled="!selectedFunctions.length || importing" @click="importFunctions">{{ importing ? 'Importando...' : 'Importar selecionadas' }}</button></div></div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useApi } from '@/composables/useApi'
import type { AwsConnection, AwsLambdaFunction, Company } from '@/types'

const props = defineProps<{ companies: Company[] }>()
const emit = defineEmits<{ changed: [connections: AwsConnection[]]; imported: [] }>()
const api = useApi()
const connections = ref<AwsConnection[]>([])
const loading = ref(false)
const saving = ref(false)
const testingId = ref<number | null>(null)
const createVisible = ref(false)
const discoverVisible = ref(false)
const discoverLoading = ref(false)
const importing = ref(false)
const activeConnection = ref<AwsConnection | null>(null)
const discoverRegion = ref('us-east-2')
const functions = ref<AwsLambdaFunction[]>([])
const selectedFunctions = ref<string[]>([])
const functionSearch = ref('')
const form = ref({ name: '', companyId: null as number | null, defaultRegion: 'us-east-2', accessKeyId: '', secretAccessKey: '' })

const notifyError = (error: unknown) => window.alert(error instanceof Error ? error.message : 'Não foi possível concluir a operação.')
const filteredFunctions = computed(() => {
  const search = functionSearch.value.trim().toLocaleLowerCase('pt-BR')
  if (!search) return functions.value
  return functions.value.filter(fn => [fn.functionName, fn.runtime || ''].some(value => value.toLocaleLowerCase('pt-BR').includes(search)))
})

const fetchConnections = async () => {
  loading.value = true
  try {
    const data = await api.get<{ connections: AwsConnection[] }>('/lambda/aws-connections')
    connections.value = data.connections
    emit('changed', connections.value)
  } catch (error) { notifyError(error) } finally { loading.value = false }
}

const openCreate = () => {
  form.value = { name: '', companyId: props.companies[0]?.id || null, defaultRegion: 'us-east-2', accessKeyId: '', secretAccessKey: '' }
  createVisible.value = true
}

const createConnection = async () => {
  saving.value = true
  try {
    await api.post('/lambda/aws-connections', { ...form.value })
    createVisible.value = false
    await fetchConnections()
  } catch (error) { notifyError(error) } finally { saving.value = false }
}

const testConnection = async (connection: AwsConnection) => {
  testingId.value = connection.id
  try { await api.post(`/lambda/aws-connections/${connection.id}/test`); await fetchConnections() } catch (error) { notifyError(error); await fetchConnections() } finally { testingId.value = null }
}

const removeConnection = async (connection: AwsConnection) => {
  if (!window.confirm(`Excluir a conexão "${connection.name}"?`)) return
  try { await api.del(`/lambda/aws-connections/${connection.id}`); await fetchConnections() } catch (error) { notifyError(error) }
}

const discover = async (connection: AwsConnection) => {
  activeConnection.value = connection
  discoverRegion.value = connection.defaultRegion
  functions.value = []
  selectedFunctions.value = []
  functionSearch.value = ''
  discoverVisible.value = true
  await loadFunctions()
}

const loadFunctions = async () => {
  if (!activeConnection.value) return
  discoverLoading.value = true
  try {
    const data = await api.get<{ functions: AwsLambdaFunction[] }>(`/lambda/aws-connections/${activeConnection.value.id}/functions?region=${encodeURIComponent(discoverRegion.value)}`)
    functions.value = data.functions
    selectedFunctions.value = selectedFunctions.value.filter(name => data.functions.some(fn => fn.functionName === name && !fn.importedWithConnectionId))
  } catch (error) { notifyError(error) } finally { discoverLoading.value = false }
}

const importFunctions = async () => {
  if (!activeConnection.value || !selectedFunctions.value.length) return
  importing.value = true
  try {
    await api.post(`/lambda/aws-connections/${activeConnection.value.id}/import`, { region: discoverRegion.value, functionNames: selectedFunctions.value })
    selectedFunctions.value = []
    await Promise.all([loadFunctions(), fetchConnections()])
    emit('imported')
  } catch (error) { notifyError(error) } finally { importing.value = false }
}

onMounted(fetchConnections)
</script>
