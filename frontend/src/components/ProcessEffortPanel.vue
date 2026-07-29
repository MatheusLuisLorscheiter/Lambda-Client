<template>
  <section class="space-y-5">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h4 class="text-sm font-semibold text-slate-900">Esforço operacional</h4>
        <p class="mt-1 text-xs leading-5 text-slate-500">
          Veja quanto trabalho manual existe hoje e quanto foi liberado pela automação.
        </p>
      </div>
      <button
        v-if="permissions.canManage"
        type="button"
        class="shrink-0 rounded-md bg-slate-950 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800"
        @click="openCreate()"
      >
        Registrar esforço
      </button>
    </div>

    <div v-if="loading" class="rounded-md border border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
      Carregando medições…
    </div>
    <div v-else-if="loadError" class="rounded-md border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
      <div class="flex items-center justify-between gap-3">
        <span>{{ loadError }}</span>
        <button type="button" class="font-medium underline underline-offset-2" @click="fetchEffort">Tentar novamente</button>
      </div>
    </div>

    <template v-else>
      <div v-if="comparison.baseline" class="grid gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
        <div class="bg-white px-4 py-3">
          <p class="text-xs text-slate-500">Antes da automação</p>
          <p class="mt-1 text-xl font-semibold text-slate-950">{{ formatHours(comparison.baseline.workHoursPerMonth) }}</p>
          <p class="mt-0.5 text-[11px] text-slate-400">{{ formatFte(comparison.baseline.fteEquivalent) }} pessoa equivalente</p>
        </div>
        <div class="bg-white px-4 py-3">
          <p class="text-xs text-slate-500">Após a automação</p>
          <p class="mt-1 text-xl font-semibold text-slate-950">
            {{ comparison.postAutomation ? formatHours(comparison.postAutomation.workHoursPerMonth) : 'A medir' }}
          </p>
          <p class="mt-0.5 text-[11px] text-slate-400">
            {{ comparison.postAutomation ? `${formatFte(comparison.postAutomation.fteEquivalent)} pessoa equivalente` : 'Registre após a implantação' }}
          </p>
        </div>
        <div class="bg-white px-4 py-3">
          <p class="text-xs text-slate-500">Horas liberadas / mês</p>
          <p class="mt-1 text-xl font-semibold" :class="savingsTone">
            {{ comparison.savings ? formatHours(comparison.savings.monthlyHours) : '—' }}
          </p>
          <p class="mt-0.5 text-[11px] text-slate-400">
            {{ comparison.savings ? `${formatHours(comparison.savings.annualHours)} por ano` : 'Aguardando medição posterior' }}
          </p>
        </div>
        <div class="bg-white px-4 py-3">
          <p class="text-xs text-slate-500">Redução de esforço</p>
          <p class="mt-1 text-xl font-semibold" :class="savingsTone">
            {{ comparison.savings ? formatPercent(comparison.savings.reductionPercent) : '—' }}
          </p>
          <p class="mt-0.5 text-[11px] text-slate-400">
            {{ comparison.savings ? `${formatFte(comparison.savings.monthlyFte)} pessoa equivalente` : 'Comparação ainda incompleta' }}
          </p>
        </div>
      </div>

      <div v-if="!assessments.length" class="rounded-lg border border-dashed border-slate-300 px-5 py-10 text-center">
        <p class="text-sm font-medium text-slate-800">Quanto tempo esse processo consome hoje?</p>
        <p class="mx-auto mt-1 max-w-lg text-xs leading-5 text-slate-500">
          Para cada atividade, informe o tempo por vez, a frequência e quantas pessoas participam. O Lambda Pulse faz todas as contas.
        </p>
        <button
          v-if="permissions.canManage"
          type="button"
          class="mt-4 rounded-md bg-slate-950 px-4 py-2 text-xs font-medium text-white"
          @click="openCreate('baseline')"
        >
          Informar esforço atual
        </button>
      </div>

      <div v-else class="space-y-3">
        <article
          v-for="assessment in assessments"
          :key="assessment.id"
          class="rounded-lg border border-slate-200 bg-white"
        >
          <button
            type="button"
            class="flex w-full items-start justify-between gap-4 px-4 py-4 text-left"
            @click="toggleExpanded(assessment.id)"
          >
            <span class="min-w-0">
              <span class="flex flex-wrap items-center gap-2">
                <span :class="stageClass(assessment.stage)" class="rounded-full px-2 py-0.5 text-xs font-medium">
                  {{ stageLabel(assessment.stage) }}
                </span>
                <span :class="assessment.status === 'confirmed' ? 'text-emerald-700' : 'text-amber-700'" class="text-xs font-medium">
                  {{ assessment.status === 'confirmed' ? 'Confirmada' : 'Rascunho' }}
                </span>
              </span>
              <span class="mt-2 block truncate text-sm font-semibold text-slate-900">{{ assessment.label }}</span>
              <span class="mt-1 block text-xs text-slate-500">
                {{ formatDate(assessment.measuredAt) }} · {{ sourceLabel(assessment.source) }} · {{ assessment.items.length }} atividade{{ assessment.items.length === 1 ? '' : 's' }}
              </span>
            </span>
            <span class="shrink-0 text-right">
              <span class="block text-sm font-semibold text-slate-900">{{ formatHours(assessmentWorkHours(assessment)) }}</span>
              <span class="mt-1 block text-[11px] text-slate-400">trabalho / mês</span>
            </span>
          </button>

          <div v-if="expandedIds.has(assessment.id)" class="border-t border-slate-200 px-4 py-4">
            <div class="overflow-x-auto">
              <table class="w-full min-w-[620px] text-left text-xs">
                <thead class="text-slate-400">
                  <tr>
                    <th class="pb-2 font-medium">Atividade / função</th>
                    <th class="pb-2 font-medium">Tempo</th>
                    <th class="pb-2 font-medium">Frequência</th>
                    <th class="pb-2 font-medium">Pessoas</th>
                    <th class="pb-2 text-right font-medium">Esforço mensal</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 text-slate-700">
                  <tr v-for="item in assessment.items" :key="item.id || item.activityName">
                    <td class="py-2.5 pr-3">
                      <span class="block font-medium text-slate-800">{{ item.activityName }}</span>
                      <span v-if="item.roleName" class="mt-0.5 block text-slate-400">{{ item.roleName }}</span>
                    </td>
                    <td class="py-2.5 pr-3">{{ formatMinutes(item.executionTimeMinutes) }}</td>
                    <td class="py-2.5 pr-3">{{ formatNumber(item.executionsPerPeriod) }} / {{ periodShortLabel(item.periodUnit) }}</td>
                    <td class="py-2.5 pr-3">{{ formatNumber(item.peopleCount) }}</td>
                    <td class="py-2.5 text-right font-medium">{{ formatHours(itemWorkHours(item)) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-if="assessment.notes" class="mt-3 whitespace-pre-wrap border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">{{ assessment.notes }}</p>
            <div v-if="permissions.canManage" class="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                v-if="assessment.status === 'draft'"
                type="button"
                class="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700"
                @click="openEdit(assessment)"
              >
                Editar rascunho
              </button>
              <button
                v-if="assessment.status === 'draft' || permissions.canDeleteConfirmed"
                type="button"
                class="rounded-md px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                @click="assessmentToDelete = assessment"
              >
                Excluir
              </button>
            </div>
          </div>
        </article>
      </div>
    </template>

    <Teleport to="body">
      <div v-if="editorOpen" class="fixed inset-0 z-[90] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-slate-950/55" @click="closeEditor"></div>
        <div class="relative flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
          <header class="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
            <div>
              <h3 class="text-lg font-semibold text-slate-950">{{ editor.id ? 'Editar medição' : 'Nova medição de esforço' }}</h3>
              <p class="mt-1 text-sm text-slate-500">Responda às perguntas abaixo. Os cálculos são automáticos.</p>
            </div>
            <button type="button" class="rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Fechar" @click="closeEditor">✕</button>
          </header>

          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            <div>
              <p class="text-sm font-semibold text-slate-900">1. Quando este esforço acontece?</p>
              <div class="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  class="rounded-md border px-4 py-3 text-left"
                  :class="editor.stage === 'baseline' ? 'border-slate-950 bg-slate-50' : 'border-slate-200 hover:border-slate-300'"
                  @click="setEditorStage('baseline')"
                >
                  <span class="block text-sm font-medium text-slate-900">Antes da automação</span>
                  <span class="mt-0.5 block text-xs text-slate-500">O trabalho manual realizado hoje.</span>
                </button>
                <button
                  type="button"
                  class="rounded-md border px-4 py-3 text-left"
                  :class="editor.stage === 'post_automation' ? 'border-slate-950 bg-slate-50' : 'border-slate-200 hover:border-slate-300'"
                  @click="setEditorStage('post_automation')"
                >
                  <span class="block text-sm font-medium text-slate-900">Depois da automação</span>
                  <span class="mt-0.5 block text-xs text-slate-500">O esforço que permaneceu após a entrega.</span>
                </button>
              </div>
            </div>

            <div class="mt-6 flex items-center justify-between gap-3 border-t border-slate-200 pt-5">
              <div>
                <h4 class="text-sm font-semibold text-slate-900">2. Quais atividades consomem tempo da equipe?</h4>
                <p class="mt-0.5 text-xs text-slate-500">Crie uma atividade para cada rotina com tempo ou frequência diferente.</p>
              </div>
              <button type="button" class="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700" @click="addItem">
                Adicionar atividade
              </button>
            </div>

            <div class="mt-4 space-y-3">
              <article v-for="(item, index) in editor.items" :key="item.localId" class="rounded-lg border border-slate-200 p-4">
                <div class="flex items-center justify-between gap-3">
                  <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Atividade {{ index + 1 }}</p>
                  <button v-if="editor.items.length > 1" type="button" class="text-xs font-medium text-red-600" @click="removeItem(index)">Remover</button>
                </div>
                <div class="mt-3">
                  <label class="mb-1 block text-xs font-medium text-slate-600">O que é feito?</label>
                  <input v-model="item.activityName" maxlength="160" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm" placeholder="Ex.: Conferir e lançar pedidos">
                </div>
                <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label class="mb-1 block text-xs font-medium text-slate-600">Quantos minutos por vez?</label>
                    <input v-model.number="item.executionTimeMinutes" type="number" min="0.01" step="0.01" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm">
                  </div>
                  <div>
                    <label class="mb-1 block text-xs font-medium text-slate-600">Quantas vezes?</label>
                    <input v-model.number="item.executionsPerPeriod" type="number" min="0.01" step="0.01" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm">
                  </div>
                  <div>
                    <label class="mb-1 block text-xs font-medium text-slate-600">Em cada</label>
                    <select v-model="item.periodUnit" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm">
                      <option value="day">Dia útil</option>
                      <option value="week">Semana</option>
                      <option value="month">Mês</option>
                      <option value="quarter">Trimestre</option>
                      <option value="year">Ano</option>
                    </select>
                  </div>
                  <div>
                    <label class="mb-1 block text-xs font-medium text-slate-600">Quantas pessoas?</label>
                    <input v-model.number="item.peopleCount" type="number" min="0.01" step="0.01" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm">
                  </div>
                </div>
                <div class="mt-3 flex flex-col gap-2 rounded-md bg-slate-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p class="text-xs text-slate-500">Esta atividade representa aproximadamente</p>
                  <p class="text-sm font-semibold text-slate-900">{{ formatHours(itemWorkHours(item)) }} de trabalho por mês</p>
                </div>
                <details class="mt-3 rounded-md border border-slate-200">
                  <summary class="cursor-pointer px-3 py-2.5 text-xs font-medium text-slate-600">Detalhes opcionais</summary>
                  <div class="grid gap-3 border-t border-slate-200 p-3 sm:grid-cols-2">
                    <div>
                      <label class="mb-1 block text-xs font-medium text-slate-600">Quem realiza?</label>
                      <input v-model="item.roleName" maxlength="160" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Ex.: Assistente financeiro">
                    </div>
                    <div v-if="item.periodUnit === 'day'">
                      <label class="mb-1 block text-xs font-medium text-slate-600">Dias de operação por mês</label>
                      <input v-model.number="item.workingDaysPerMonth" type="number" min="1" max="31" step="0.5" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                    </div>
                    <div>
                      <label class="mb-1 block text-xs font-medium text-slate-600">Horas disponíveis por pessoa/mês</label>
                      <input v-model.number="item.monthlyHoursPerEmployee" type="number" min="1" max="744" step="1" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                    </div>
                    <div class="sm:col-span-2">
                      <label class="mb-1 block text-xs font-medium text-slate-600">Observações</label>
                      <input v-model="item.notes" maxlength="2000" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Variações, exceções ou premissas">
                    </div>
                  </div>
                </details>
              </article>
            </div>

            <div class="mt-5 grid gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-3">
              <div class="bg-slate-50 px-4 py-3"><p class="text-xs text-slate-500">Horas de trabalho / mês</p><p class="mt-1 text-lg font-semibold text-slate-900">{{ formatHours(editorTotals.workHoursPerMonth) }}</p></div>
              <div class="bg-slate-50 px-4 py-3"><p class="text-xs text-slate-500">Pessoas equivalentes</p><p class="mt-1 text-lg font-semibold text-slate-900">{{ formatFte(editorTotals.fteEquivalent) }}</p></div>
              <div class="bg-slate-50 px-4 py-3"><p class="text-xs text-slate-500">Atividades mapeadas</p><p class="mt-1 text-lg font-semibold text-slate-900">{{ editor.items.length }}</p></div>
            </div>
            <details class="mt-4 rounded-md border border-slate-200">
              <summary class="cursor-pointer px-4 py-3 text-xs font-medium text-slate-600">Identificação e fonte da medição</summary>
              <div class="grid gap-4 border-t border-slate-200 p-4 sm:grid-cols-2">
                <div>
                  <label class="mb-1.5 block text-xs font-medium text-slate-600">Nome da medição</label>
                  <input v-model="editor.label" maxlength="160" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm">
                </div>
                <div>
                  <label class="mb-1.5 block text-xs font-medium text-slate-600">Data</label>
                  <input v-model="editor.measuredAt" type="date" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm">
                </div>
                <div>
                  <label class="mb-1.5 block text-xs font-medium text-slate-600">Origem dos dados</label>
                  <select v-model="editor.source" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm">
                    <option value="estimated">Estimativa da equipe</option>
                    <option value="observed">Tempo observado</option>
                    <option value="system">Extraído de sistema</option>
                  </select>
                </div>
                <div>
                  <label class="mb-1.5 block text-xs font-medium text-slate-600">Observações gerais</label>
                  <input v-model="editor.notes" maxlength="5000" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm">
                </div>
              </div>
            </details>
            <p v-if="editorError" class="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{{ editorError }}</p>
          </div>

          <footer class="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p class="text-xs leading-5 text-slate-400">Concluir bloqueia esta medição e preserva o histórico. Um rascunho pode ser editado depois.</p>
            <div class="flex justify-end gap-2">
              <button type="button" class="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700" @click="closeEditor">Cancelar</button>
              <button :disabled="saving" type="button" class="rounded-md border border-slate-900 px-3 py-2 text-sm font-medium text-slate-900 disabled:opacity-50" @click="saveAssessment('draft')">
                {{ saving ? 'Salvando…' : 'Salvar e continuar depois' }}
              </button>
              <button :disabled="saving" type="button" class="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" @click="saveAssessment('confirmed')">
                Concluir medição
              </button>
            </div>
          </footer>
        </div>
      </div>

      <div v-if="assessmentToDelete" class="fixed inset-0 z-[95] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-slate-950/55" @click="assessmentToDelete = null"></div>
        <div class="relative w-full max-w-md rounded-lg border border-red-200 bg-white p-6 shadow-xl">
          <h3 class="text-lg font-semibold text-slate-950">Excluir esta medição?</h3>
          <p class="mt-2 text-sm leading-6 text-slate-500">
            “{{ assessmentToDelete.label }}” e todas as atividades vinculadas serão removidas. Esta ação não pode ser desfeita.
          </p>
          <p v-if="deleteError" class="mt-3 text-sm text-red-700">{{ deleteError }}</p>
          <div class="mt-5 flex justify-end gap-2">
            <button type="button" class="rounded-md border border-slate-300 px-3 py-2 text-sm" @click="assessmentToDelete = null">Cancelar</button>
            <button :disabled="saving" type="button" class="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" @click="deleteAssessment">Excluir medição</button>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useApi } from '@/composables/useApi'
import { formatCalendarDate } from '@/utils/dates'
import type {
  ProcessEffortAssessment,
  ProcessEffortComparison,
  ProcessEffortItem,
  ProcessEffortPeriodUnit,
  ProcessEffortSource,
  ProcessEffortStage,
  ProcessEffortStatus
} from '@/types'

const props = defineProps<{ processId: number }>()
const emit = defineEmits<{ changed: [] }>()
const api = useApi()

type EditableItem = Omit<ProcessEffortItem, 'id'> & { localId: number; roleName: string; notes: string }
type Editor = {
  id: number | null
  version: number | null
  stage: ProcessEffortStage
  label: string
  measuredAt: string
  source: ProcessEffortSource
  notes: string
  items: EditableItem[]
}

const emptyComparison = (): ProcessEffortComparison => ({ baseline: null, postAutomation: null, savings: null })
const assessments = ref<ProcessEffortAssessment[]>([])
const comparison = ref<ProcessEffortComparison>(emptyComparison())
const permissions = ref({ canManage: false, canDeleteConfirmed: false })
const loading = ref(true)
const saving = ref(false)
const loadError = ref('')
const editorError = ref('')
const deleteError = ref('')
const editorOpen = ref(false)
const expandedIds = ref(new Set<number>())
const assessmentToDelete = ref<ProcessEffortAssessment | null>(null)
let nextLocalId = 0

const localToday = () => {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}
const newItem = (): EditableItem => ({
  localId: ++nextLocalId,
  activityName: '',
  roleName: '',
  executionTimeMinutes: 1,
  executionsPerPeriod: 1,
  periodUnit: 'month',
  workingDaysPerMonth: 22,
  peopleCount: 1,
  monthlyHoursPerEmployee: 176,
  notes: ''
})
const emptyEditor = (stage: ProcessEffortStage = 'baseline'): Editor => ({
  id: null,
  version: null,
  stage,
  label: stage === 'baseline' ? 'Linha de base operacional' : 'Medição após a automação',
  measuredAt: localToday(),
  source: 'estimated',
  notes: '',
  items: [newItem()]
})
const editor = ref<Editor>(emptyEditor())

const monthlyFactors: Record<ProcessEffortPeriodUnit, number> = {
  day: 22,
  week: 52 / 12,
  month: 1,
  quarter: 1 / 3,
  year: 1 / 12
}
const itemWorkHours = (item: Pick<ProcessEffortItem, 'executionTimeMinutes' | 'executionsPerPeriod' | 'periodUnit' | 'workingDaysPerMonth' | 'peopleCount'>) => {
  const minutes = Number(item.executionTimeMinutes) || 0
  const executions = Number(item.executionsPerPeriod) || 0
  const people = Number(item.peopleCount) || 0
  const periodFactor = item.periodUnit === 'day'
    ? (Number(item.workingDaysPerMonth) || 22)
    : monthlyFactors[item.periodUnit]
  return (minutes * executions * periodFactor * people) / 60
}
const itemFte = (item: Pick<ProcessEffortItem, 'monthlyHoursPerEmployee'> & Parameters<typeof itemWorkHours>[0]) =>
  itemWorkHours(item) / (Number(item.monthlyHoursPerEmployee) || 176)
const assessmentWorkHours = (assessment: ProcessEffortAssessment) =>
  assessment.items.reduce((sum, item) => sum + itemWorkHours(item), 0)
const editorTotals = computed(() => ({
  workHoursPerMonth: editor.value.items.reduce((sum, item) => sum + itemWorkHours(item), 0),
  fteEquivalent: editor.value.items.reduce((sum, item) => sum + itemFte(item), 0)
}))
const savingsTone = computed(() => {
  if (!comparison.value.savings) return 'text-slate-950'
  return comparison.value.savings.monthlyHours >= 0 ? 'text-emerald-700' : 'text-red-700'
})

const formatNumber = (value: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number(value))
const formatHours = (value: number) => `${formatNumber(value)} h`
const formatFte = (value: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value))
const formatPercent = (value: number) => `${formatNumber(value)}%`
const formatMinutes = (value: number) => `${formatNumber(value)} min`
const formatDate = (value: string) => formatCalendarDate(value, { day: '2-digit', month: 'short', year: 'numeric' })
const stageLabel = (stage: ProcessEffortStage) => stage === 'baseline' ? 'Antes da automação' : 'Após a automação'
const stageClass = (stage: ProcessEffortStage) => stage === 'baseline'
  ? 'bg-slate-100 text-slate-700'
  : 'bg-emerald-50 text-emerald-700'
const sourceLabel = (source: ProcessEffortSource) => ({
  estimated: 'Estimativa da equipe',
  observed: 'Tempo observado',
  system: 'Extraído de sistema'
}[source])
const periodShortLabel = (period: ProcessEffortPeriodUnit) => ({
  day: 'dia útil',
  week: 'semana',
  month: 'mês',
  quarter: 'trimestre',
  year: 'ano'
}[period])

const fetchEffort = async () => {
  loading.value = true
  loadError.value = ''
  try {
    const data = await api.get<{
      assessments: ProcessEffortAssessment[]
      comparison: ProcessEffortComparison
      permissions: { canManage: boolean; canDeleteConfirmed: boolean }
    }>(`/processes/${props.processId}/effort`)
    assessments.value = data.assessments
    comparison.value = data.comparison
    permissions.value = data.permissions
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Não foi possível carregar as medições'
  } finally {
    loading.value = false
  }
}
const toggleExpanded = (id: number) => {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}
const openCreate = (stage: ProcessEffortStage = comparison.value.baseline ? 'post_automation' : 'baseline') => {
  editor.value = emptyEditor(stage)
  editorError.value = ''
  editorOpen.value = true
}
const openEdit = (assessment: ProcessEffortAssessment) => {
  editor.value = {
    id: assessment.id,
    version: assessment.version,
    stage: assessment.stage,
    label: assessment.label,
    measuredAt: assessment.measuredAt,
    source: assessment.source,
    notes: assessment.notes || '',
    items: assessment.items.map(item => ({
      localId: ++nextLocalId,
      activityName: item.activityName,
      roleName: item.roleName || '',
      executionTimeMinutes: Number(item.executionTimeMinutes),
      executionsPerPeriod: Number(item.executionsPerPeriod),
      periodUnit: item.periodUnit,
      workingDaysPerMonth: Number(item.workingDaysPerMonth || 22),
      peopleCount: Number(item.peopleCount),
      monthlyHoursPerEmployee: Number(item.monthlyHoursPerEmployee),
      notes: item.notes || ''
    }))
  }
  editorError.value = ''
  editorOpen.value = true
}
const closeEditor = () => {
  editorOpen.value = false
  editorError.value = ''
}
const applyDefaultLabel = () => {
  if (!editor.value.id && ['Linha de base operacional', 'Medição após a automação'].includes(editor.value.label)) {
    editor.value.label = editor.value.stage === 'baseline'
      ? 'Linha de base operacional'
      : 'Medição após a automação'
  }
}
const setEditorStage = (stage: ProcessEffortStage) => {
  editor.value.stage = stage
  applyDefaultLabel()
}
const addItem = () => {
  if (editor.value.items.length < 50) editor.value.items.push(newItem())
}
const removeItem = (index: number) => editor.value.items.splice(index, 1)
const validateEditor = () => {
  if (!editor.value.label.trim()) return 'Informe um nome para a medição'
  if (!editor.value.measuredAt) return 'Informe a data da medição'
  if (!editor.value.items.length) return 'Adicione ao menos uma atividade'
  const invalidIndex = editor.value.items.findIndex(item =>
    !item.activityName.trim() ||
    !(Number(item.executionTimeMinutes) > 0) ||
    !(Number(item.executionsPerPeriod) > 0) ||
    !(Number(item.workingDaysPerMonth) > 0 && Number(item.workingDaysPerMonth) <= 31) ||
    !(Number(item.peopleCount) > 0) ||
    !(Number(item.monthlyHoursPerEmployee) > 0)
  )
  return invalidIndex >= 0 ? `Revise os campos obrigatórios da atividade ${invalidIndex + 1}` : ''
}
const saveAssessment = async (status: ProcessEffortStatus) => {
  const validationError = validateEditor()
  if (validationError) {
    editorError.value = validationError
    return
  }
  saving.value = true
  editorError.value = ''
  const payload = {
    stage: editor.value.stage,
    label: editor.value.label.trim(),
    measuredAt: editor.value.measuredAt,
    source: editor.value.source,
    status,
    notes: editor.value.notes.trim() || null,
    items: editor.value.items.map(item => ({
      activityName: item.activityName.trim(),
      roleName: item.roleName.trim() || null,
      executionTimeMinutes: Number(item.executionTimeMinutes),
      executionsPerPeriod: Number(item.executionsPerPeriod),
      periodUnit: item.periodUnit,
      workingDaysPerMonth: Number(item.workingDaysPerMonth),
      peopleCount: Number(item.peopleCount),
      monthlyHoursPerEmployee: Number(item.monthlyHoursPerEmployee),
      notes: item.notes.trim() || null
    })),
    ...(editor.value.id ? { expectedVersion: editor.value.version } : {})
  }
  try {
    if (editor.value.id) {
      await api.patch(`/processes/${props.processId}/effort/${editor.value.id}`, payload)
    } else {
      await api.post(`/processes/${props.processId}/effort`, payload)
    }
    closeEditor()
    await fetchEffort()
    emit('changed')
  } catch (error) {
    editorError.value = error instanceof Error ? error.message : 'Não foi possível salvar a medição'
  } finally {
    saving.value = false
  }
}
const deleteAssessment = async () => {
  if (!assessmentToDelete.value) return
  saving.value = true
  deleteError.value = ''
  try {
    await api.del(`/processes/${props.processId}/effort/${assessmentToDelete.value.id}`)
    assessmentToDelete.value = null
    await fetchEffort()
    emit('changed')
  } catch (error) {
    deleteError.value = error instanceof Error ? error.message : 'Não foi possível excluir a medição'
  } finally {
    saving.value = false
  }
}

watch(() => props.processId, () => void fetchEffort())
onMounted(() => void fetchEffort())
</script>
