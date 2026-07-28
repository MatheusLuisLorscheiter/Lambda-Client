<template>
  <div>
    <div class="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div class="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap">
        <div class="min-w-60 flex-1">
          <label class="mb-1 block text-xs font-medium text-slate-500">Busca</label>
          <input v-model="searchFilter" type="search" placeholder="Código, título, empresa ou próximo passo" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
        </div>
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
      <div v-else-if="loadError" class="p-10 text-center">
        <p class="text-sm font-medium text-slate-800">Não foi possível carregar as demandas</p>
        <p class="mt-1 text-sm text-slate-500">{{ loadError }}</p>
        <button class="mt-3 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" @click="fetchProcesses">Tentar novamente</button>
      </div>
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
              <span class="font-mono text-xs text-slate-400">{{ item.referenceCode }}</span>
              <span v-if="item.position && item.status === 'queued'" class="text-xs font-medium text-slate-500">#{{ item.position }} na fila</span>
              <span v-if="item.health !== 'on_track'" :class="healthClass(item.health)" class="rounded-full px-2 py-0.5 text-xs font-medium">{{ healthLabel(item.health) }}</span>
            </div>
            <p class="mt-2 truncate font-medium text-slate-950">{{ item.title }}</p>
            <p class="mt-1 truncate text-sm text-slate-500">{{ item.nextAction || item.latestUpdate || item.description }}</p>
            <p v-if="item.integrations?.length" class="mt-1 text-xs font-medium text-indigo-600">
              {{ item.integrations.length }} automação(ões) vinculada(s)
            </p>
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
              <div class="flex items-center gap-2">
                <button v-if="editor.id" type="button" class="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50" @click="openChecklistModal">+ Etapa</button>
                <button v-if="editor.id" type="button" class="rounded-md bg-slate-950 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800" @click="openDeliveryModal">Registrar entrega</button>
                <button type="button" class="rounded-md p-2 text-slate-500 hover:bg-slate-100" @click="closeEditor">✕</button>
              </div>
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
              <div class="grid gap-4">
                <div>
                  <label class="mb-1.5 block text-sm font-medium text-slate-700">Resultado esperado</label>
                  <textarea v-model="editor.objective" rows="3" maxlength="3000" class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm"></textarea>
                </div>
                <div>
                  <label class="mb-1.5 block text-sm font-medium text-slate-700">Escopo</label>
                  <textarea v-model="editor.scope" rows="3" maxlength="5000" class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm"></textarea>
                </div>
                <div>
                  <label class="mb-1.5 block text-sm font-medium text-slate-700">Critérios de aceite</label>
                  <textarea v-model="editor.acceptanceCriteria" rows="3" maxlength="5000" class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm"></textarea>
                </div>
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
                  <label class="mb-1.5 block text-sm font-medium text-slate-700">Impacto no negócio</label>
                  <select v-model="editor.impact" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm">
                    <option value="low">Baixo</option><option value="medium">Médio</option><option value="high">Alto</option><option value="critical">Crítico</option>
                  </select>
                </div>
                <div>
                  <label class="mb-1.5 block text-sm font-medium text-slate-700">Saúde do trabalho</label>
                  <select v-model="editor.health" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm">
                    <option value="on_track">No prazo</option><option value="at_risk">Em risco</option><option value="off_track">Fora do plano</option><option value="blocked">Bloqueado</option>
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
                  <input v-model.number="editor.position" type="number" min="1" :disabled="editor.status !== 'queued'" :placeholder="editor.status === 'queued' ? 'Automática' : 'Disponível ao entrar na fila'" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-100 disabled:text-slate-400" />
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
              <div v-if="editor.health === 'blocked'">
                <label class="mb-1.5 block text-sm font-medium text-slate-700">Motivo do bloqueio</label>
                <textarea v-model="editor.blockedReason" required rows="2" maxlength="2000" class="w-full resize-none rounded-md border border-red-300 px-3 py-2.5 text-sm"></textarea>
              </div>
              <div>
                <label class="mb-1.5 block text-sm font-medium text-slate-700">Próximo passo</label>
                <textarea v-model="editor.nextAction" rows="2" maxlength="2000" placeholder="Ação objetiva, responsável e resultado esperado" class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm"></textarea>
              </div>
              <div>
                <label class="mb-1.5 block text-sm font-medium text-slate-700">Tags</label>
                <input v-model="editor.tagsText" maxlength="800" placeholder="financeiro, omie, pedidos" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm" />
                <p class="mt-1 text-xs text-slate-400">Separe por vírgulas. As tags ajudam na busca e organização.</p>
              </div>
              <label class="flex items-center justify-between rounded-md border border-slate-200 px-3 py-3">
                <span><span class="block text-sm font-medium text-slate-700">Comentários do cliente</span><span class="mt-0.5 block text-xs text-slate-400">Permite dúvidas e validações nesta demanda.</span></span>
                <input v-model="editor.clientCanComment" type="checkbox" class="h-4 w-4 rounded border-slate-300" />
              </label>
              <div>
                <div class="mb-1.5 flex justify-between"><label class="text-sm font-medium text-slate-700">Progresso</label><span class="text-sm font-medium text-slate-500">{{ editor.progress }}%</span></div>
                <input v-model.number="editor.progress" type="range" min="0" max="100" step="5" class="w-full accent-indigo-600" />
              </div>
              <section v-if="editor.id" class="border-t border-slate-200 pt-5">
                <div class="flex items-center justify-between">
                  <div>
                    <h4 class="text-sm font-semibold text-slate-900">Plano de execução</h4>
                    <p class="mt-0.5 text-xs text-slate-400">Etapas verificáveis que o cliente acompanha.</p>
                  </div>
                  <button type="button" class="text-xs font-medium text-indigo-600" @click="openChecklistModal">Adicionar etapa</button>
                </div>
                <div v-if="editor.checklist.length" class="mt-3 divide-y divide-slate-100 rounded-md border border-slate-200">
                  <div v-for="checkItem in editor.checklist" :key="checkItem.id" class="flex items-center gap-3 px-3 py-2.5">
                    <select :value="checkItem.status" class="rounded border border-slate-200 bg-white px-2 py-1 text-xs" @change="updateChecklistStatusFromEvent(checkItem.id, $event)">
                      <option value="todo">A fazer</option><option value="in_progress">Em andamento</option><option value="done">Concluída</option><option value="blocked">Bloqueada</option>
                    </select>
                    <span class="min-w-0 flex-1 truncate text-sm text-slate-700">{{ checkItem.title }}</span>
                    <button type="button" class="text-xs text-red-600" @click="deleteChecklistItem(checkItem.id)">Remover</button>
                  </div>
                </div>
                <p v-else class="mt-3 rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">Nenhuma etapa cadastrada.</p>
              </section>
              <section v-if="editor.id && editor.deliveries.length" class="border-t border-slate-200 pt-5">
                <div class="flex items-center justify-between">
                  <h4 class="text-sm font-semibold text-slate-900">Entregas registradas</h4>
                  <button type="button" class="text-xs font-medium text-indigo-600" @click="openDeliveryModal">Nova entrega</button>
                </div>
                <div class="mt-3 space-y-2">
                  <article v-for="delivery in editor.deliveries" :key="delivery.id" class="rounded-md border border-slate-200 p-3">
                    <div class="flex items-start justify-between gap-3">
                      <div><p class="text-sm font-medium text-slate-800">{{ delivery.title }}</p><p class="mt-0.5 text-xs text-slate-400">{{ delivery.version || 'Sem versão' }} · {{ delivery.environment }}</p></div>
                      <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{{ delivery.status }}</span>
                    </div>
                    <p class="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{{ delivery.summary }}</p>
                  </article>
                </div>
              </section>
              <div>
                <label class="mb-1.5 block text-sm font-medium text-slate-700">{{ editor.id ? 'Nova atualização para o cliente' : 'Atualização inicial para o cliente' }}</label>
                <textarea v-model="editor.latestUpdate" rows="3" placeholder="Ex.: Integração com o Omie concluída; iniciamos os testes de duplicidade." class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm"></textarea>
                <p v-if="editor.id" class="mt-1 text-xs text-slate-400">Deixe em branco se estiver alterando apenas os dados da demanda.</p>
              </div>
              <div v-if="editor.updates.length">
                <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Histórico recente</p>
                <ol class="mt-3 space-y-3 border-l border-slate-200 pl-4">
                  <li v-for="update in editor.updates.slice(0, 5)" :key="update.id" class="relative">
                    <span class="absolute -left-[1.29rem] top-1.5 h-2 w-2 rounded-full bg-indigo-600 ring-4 ring-white"></span>
                    <p class="text-sm text-slate-700">{{ update.message }}</p>
                    <p class="mt-0.5 text-xs text-slate-400">{{ formatDateTime(update.createdAt) }}</p>
                  </li>
                </ol>
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

    <transition name="fade">
      <div v-if="checklistModalOpen" class="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-slate-950/55" @click="checklistModalOpen = false"></div>
        <form class="relative w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-xl" @submit.prevent="createChecklistItem">
          <h3 class="text-lg font-semibold text-slate-950">Adicionar etapa</h3>
          <p class="mt-1 text-sm text-slate-500">Crie uma etapa objetiva e verificável do plano de execução.</p>
          <div class="mt-5 space-y-4">
            <div><label class="mb-1.5 block text-sm font-medium">Título</label><input v-model="checklistForm.title" required maxlength="240" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm" /></div>
            <div><label class="mb-1.5 block text-sm font-medium">Descrição</label><textarea v-model="checklistForm.description" rows="3" maxlength="3000" class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm"></textarea></div>
            <div><label class="mb-1.5 block text-sm font-medium">Prazo</label><input v-model="checklistForm.dueDate" type="date" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm" /></div>
          </div>
          <p v-if="secondaryFormError" class="mt-3 text-sm text-red-700">{{ secondaryFormError }}</p>
          <div class="mt-5 flex justify-end gap-2">
            <button type="button" class="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium" @click="checklistModalOpen = false">Cancelar</button>
            <button :disabled="secondarySaving" class="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{{ secondarySaving ? 'Salvando…' : 'Adicionar etapa' }}</button>
          </div>
        </form>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="deliveryModalOpen" class="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-slate-950/55" @click="deliveryModalOpen = false"></div>
        <form class="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-xl" @submit.prevent="createDelivery">
          <h3 class="text-lg font-semibold text-slate-950">Registrar entrega</h3>
          <p class="mt-1 text-sm text-slate-500">Documente o pacote liberado e envie para validação do cliente.</p>
          <div class="mt-5 grid gap-4 sm:grid-cols-2">
            <div class="sm:col-span-2"><label class="mb-1.5 block text-sm font-medium">Título</label><input v-model="deliveryForm.title" required maxlength="240" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm" /></div>
            <div><label class="mb-1.5 block text-sm font-medium">Versão</label><input v-model="deliveryForm.version" maxlength="80" placeholder="v1.2.0" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm" /></div>
            <div><label class="mb-1.5 block text-sm font-medium">Ambiente</label><select v-model="deliveryForm.environment" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="development">Desenvolvimento</option><option value="staging">Homologação</option><option value="production">Produção</option></select></div>
            <div class="sm:col-span-2"><label class="mb-1.5 block text-sm font-medium">Resumo da entrega</label><textarea v-model="deliveryForm.summary" required rows="4" maxlength="5000" class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm"></textarea></div>
            <div class="sm:col-span-2"><label class="mb-1.5 block text-sm font-medium">Notas da versão</label><textarea v-model="deliveryForm.releaseNotes" rows="3" class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm"></textarea></div>
            <div class="sm:col-span-2"><label class="mb-1.5 block text-sm font-medium">Plano de reversão</label><textarea v-model="deliveryForm.rollbackPlan" rows="3" class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm"></textarea></div>
            <div class="sm:col-span-2"><label class="mb-1.5 block text-sm font-medium">Links de artefatos</label><textarea v-model="deliveryForm.artifactLinksText" rows="3" placeholder="Um link http/https por linha" class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 font-mono text-sm"></textarea></div>
          </div>
          <p v-if="secondaryFormError" class="mt-3 text-sm text-red-700">{{ secondaryFormError }}</p>
          <div class="mt-5 flex justify-end gap-2">
            <button type="button" class="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium" @click="deliveryModalOpen = false">Cancelar</button>
            <button :disabled="secondarySaving" class="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{{ secondarySaving ? 'Registrando…' : 'Enviar para validação' }}</button>
          </div>
        </form>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useApi } from '@/composables/useApi'
import { formatCalendarDate, formatInstant, toCalendarDateInput } from '@/utils/dates'
import type { Company, ProcessItem, ProcessStatus } from '@/types'

defineProps<{ companies: Company[] }>()
const api = useApi()
const processes = ref<ProcessItem[]>([])
const loading = ref(true)
const saving = ref(false)
const formError = ref('')
const loadError = ref('')
const companyFilter = ref('')
const statusFilter = ref('')
const searchFilter = ref('')
const editorOpen = ref(false)
const emptyEditor = () => ({
  id: null as number | null, companyId: '', title: '', description: '', objective: '', scope: '',
  acceptanceCriteria: '', category: 'automation', status: 'requested' as ProcessStatus,
  priority: 'normal', impact: 'medium', health: 'on_track', complexity: '', position: null as number | null,
  estimateBusinessDays: null as number | null, plannedStart: '', dueDate: '', progress: 0, latestUpdate: '',
  blockedReason: '', nextAction: '', tagsText: '', clientCanComment: true,
  updates: [] as NonNullable<ProcessItem['updates']>,
  checklist: [] as NonNullable<ProcessItem['checklist']>,
  deliveries: [] as NonNullable<ProcessItem['deliveries']>
})
const editor = ref(emptyEditor())
const checklistModalOpen = ref(false)
const deliveryModalOpen = ref(false)
const secondarySaving = ref(false)
const secondaryFormError = ref('')
const checklistForm = ref({ title: '', description: '', dueDate: '' })
const deliveryForm = ref({
  title: '', version: '', environment: 'production', summary: '', releaseNotes: '',
  rollbackPlan: '', artifactLinksText: ''
})
const statuses: Array<{ value: ProcessStatus; label: string }> = [
  { value: 'requested', label: 'Recebida' }, { value: 'analysis', label: 'Em análise' }, { value: 'queued', label: 'Na fila' },
  { value: 'in_progress', label: 'Em desenvolvimento' }, { value: 'validation', label: 'Em validação' }, { value: 'delivered', label: 'Entregue' },
  { value: 'paused', label: 'Pausada' }, { value: 'cancelled', label: 'Cancelada' }
]
const filteredProcesses = computed(() => {
  const search = searchFilter.value.trim().toLocaleLowerCase('pt-BR')
  return processes.value.filter(item =>
    (!companyFilter.value || String(item.companyId) === companyFilter.value) &&
    (!statusFilter.value || item.status === statusFilter.value) &&
    (!search || [item.referenceCode, item.title, item.companyName, item.description, item.nextAction]
      .some(value => value?.toLocaleLowerCase('pt-BR').includes(search)))
  )
})
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
const healthLabel = (health: ProcessItem['health']) => ({
  on_track: 'No prazo', at_risk: 'Em risco', off_track: 'Fora do plano', blocked: 'Bloqueada'
}[health])
const healthClass = (health: ProcessItem['health']) => ({
  on_track: 'bg-emerald-50 text-emerald-700', at_risk: 'bg-amber-100 text-amber-800',
  off_track: 'bg-red-100 text-red-800', blocked: 'bg-red-100 text-red-800'
}[health])
const formatDate = (date: string) => formatCalendarDate(date)
const formatDateTime = (date: string) => formatInstant(date, {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
})
const fetchProcesses = async () => {
  loading.value = true
  loadError.value = ''
  try {
    processes.value = (await api.get<{ processes: ProcessItem[] }>('/processes')).processes
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Tente novamente em alguns instantes.'
  }
  finally { loading.value = false }
}
const openCreate = () => { editor.value = emptyEditor(); editorOpen.value = true }
const openEdit = (item: ProcessItem) => {
  editor.value = {
    id: item.id, companyId: String(item.companyId), title: item.title, description: item.description,
    objective: item.objective || '', scope: item.scope || '', acceptanceCriteria: item.acceptanceCriteria || '',
    category: item.category, status: item.status, priority: item.priority, impact: item.impact || 'medium',
    health: item.health || 'on_track', complexity: item.complexity || '',
    position: item.position, estimateBusinessDays: item.estimateBusinessDays,
    plannedStart: toCalendarDateInput(item.plannedStart), dueDate: toCalendarDateInput(item.dueDate),
    progress: item.progress, latestUpdate: '', blockedReason: item.blockedReason || '',
    nextAction: item.nextAction || '', tagsText: (item.tags || []).join(', '),
    clientCanComment: item.clientCanComment !== false, updates: item.updates || [],
    checklist: item.checklist || [], deliveries: item.deliveries || []
  }
  editorOpen.value = true
}
const closeEditor = () => { editorOpen.value = false; formError.value = '' }
const saveProcess = async () => {
  formError.value = ''
  if (editor.value.plannedStart && editor.value.dueDate && editor.value.dueDate < editor.value.plannedStart) {
    formError.value = 'A previsão de entrega não pode ser anterior ao início planejado'
    return
  }
  saving.value = true
  const payload: Record<string, unknown> = {
    companyId: Number(editor.value.companyId), title: editor.value.title, description: editor.value.description,
    objective: editor.value.objective || null, scope: editor.value.scope || null,
    acceptanceCriteria: editor.value.acceptanceCriteria || null,
    category: editor.value.category, status: editor.value.status, priority: editor.value.priority,
    impact: editor.value.impact, health: editor.value.health,
    complexity: editor.value.complexity || null, position: editor.value.status === 'queued' ? (editor.value.position || undefined) : null,
    estimateBusinessDays: editor.value.estimateBusinessDays || null, plannedStart: editor.value.plannedStart || null,
    dueDate: editor.value.dueDate || null, progress: editor.value.progress,
    blockedReason: editor.value.health === 'blocked' ? editor.value.blockedReason : null,
    nextAction: editor.value.nextAction || null,
    tags: editor.value.tagsText.split(',').map(tag => tag.trim()).filter(Boolean),
    clientCanComment: editor.value.clientCanComment
  }
  if (editor.value.latestUpdate.trim()) payload.latestUpdate = editor.value.latestUpdate.trim()
  try {
    if (editor.value.id) await api.patch(`/processes/${editor.value.id}`, payload)
    else await api.post('/processes', payload)
    await fetchProcesses()
    closeEditor()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Não foi possível salvar a demanda'
  } finally { saving.value = false }
}

const refreshOpenEditor = async () => {
  const processId = editor.value.id
  await fetchProcesses()
  if (processId) {
    const updated = processes.value.find(item => item.id === processId)
    if (updated) openEdit(updated)
  }
}
const openChecklistModal = () => {
  checklistForm.value = { title: '', description: '', dueDate: '' }
  secondaryFormError.value = ''
  checklistModalOpen.value = true
}
const createChecklistItem = async () => {
  if (!editor.value.id) return
  secondarySaving.value = true
  secondaryFormError.value = ''
  try {
    await api.post(`/processes/${editor.value.id}/checklist`, {
      title: checklistForm.value.title,
      description: checklistForm.value.description || null,
      dueDate: checklistForm.value.dueDate || null
    })
    checklistModalOpen.value = false
    await refreshOpenEditor()
  } catch (error) {
    secondaryFormError.value = error instanceof Error ? error.message : 'Não foi possível adicionar a etapa'
  } finally {
    secondarySaving.value = false
  }
}
const updateChecklistStatus = async (itemId: number, status: string) => {
  if (!editor.value.id) return
  try {
    await api.patch(`/processes/${editor.value.id}/checklist/${itemId}`, { status })
    await refreshOpenEditor()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Não foi possível atualizar a etapa'
  }
}
const updateChecklistStatusFromEvent = (itemId: number, event: Event) => {
  const target = event.target as HTMLSelectElement
  void updateChecklistStatus(itemId, target.value)
}
const deleteChecklistItem = async (itemId: number) => {
  if (!editor.value.id || !window.confirm('Remover esta etapa do plano?')) return
  try {
    await api.del(`/processes/${editor.value.id}/checklist/${itemId}`)
    await refreshOpenEditor()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Não foi possível remover a etapa'
  }
}
const openDeliveryModal = () => {
  deliveryForm.value = {
    title: '', version: '', environment: 'production', summary: '', releaseNotes: '',
    rollbackPlan: '', artifactLinksText: ''
  }
  secondaryFormError.value = ''
  deliveryModalOpen.value = true
}
const createDelivery = async () => {
  if (!editor.value.id) return
  secondarySaving.value = true
  secondaryFormError.value = ''
  try {
    const artifactLinks = deliveryForm.value.artifactLinksText.split(/\r?\n/)
      .map(link => link.trim()).filter(Boolean)
    await api.post(`/processes/${editor.value.id}/deliveries`, {
      title: deliveryForm.value.title,
      version: deliveryForm.value.version || null,
      environment: deliveryForm.value.environment,
      summary: deliveryForm.value.summary,
      releaseNotes: deliveryForm.value.releaseNotes || null,
      rollbackPlan: deliveryForm.value.rollbackPlan || null,
      artifactLinks,
      status: 'ready'
    })
    deliveryModalOpen.value = false
    await refreshOpenEditor()
  } catch (error) {
    secondaryFormError.value = error instanceof Error ? error.message : 'Não foi possível registrar a entrega'
  } finally {
    secondarySaving.value = false
  }
}
onMounted(fetchProcesses)
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity .18s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
