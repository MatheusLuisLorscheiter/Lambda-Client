<template>
  <section>
    <div v-if="loading" class="flex min-h-64 items-center justify-center text-sm text-slate-500">
      Carregando sua esteira de automações...
    </div>
    <div v-else-if="loadError" class="flex min-h-64 flex-col items-center justify-center rounded-lg border border-slate-200 bg-white px-6 text-center">
      <p class="font-medium text-slate-900">Não foi possível carregar sua esteira</p>
      <p class="mt-1 text-sm text-slate-500">{{ loadError }}</p>
      <button class="mt-4 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" @click="fetchProcesses()">
        Tentar novamente
      </button>
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
        <div class="flex min-w-0 flex-1 flex-col gap-2 lg:flex-row">
          <input v-model="queueSearch" type="search" placeholder="Buscar por código, título ou contexto" class="min-h-10 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900" />
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
                <span class="font-mono text-xs text-slate-400">{{ item.referenceCode }}</span>
                <span v-if="item.position && item.status === 'queued'" class="text-xs font-medium text-slate-500">Fila #{{ item.position }}</span>
                <span class="text-xs text-slate-400">{{ categoryLabel(item.category) }}</span>
                <span v-if="item.health !== 'on_track'" :class="healthClass(item.health)" class="rounded-full px-2 py-0.5 text-xs font-medium">{{ healthLabel(item.health) }}</span>
              </div>
              <p class="mt-2 font-medium text-slate-950">{{ item.title }}</p>
              <p class="mt-1 truncate text-sm text-slate-500">{{ item.nextAction || item.latestUpdate || item.description }}</p>
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
              <label class="mb-1.5 block text-sm font-medium text-slate-700">Contexto atual</label>
              <textarea v-model="requestForm.description" required rows="4" maxlength="5000" placeholder="Descreva como o processo funciona hoje e onde está o gargalo." class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"></textarea>
            </div>
            <div>
              <label class="mb-1.5 block text-sm font-medium text-slate-700">Resultado esperado <span class="font-normal text-slate-400">(opcional)</span></label>
              <textarea v-model="requestForm.objective" rows="3" maxlength="3000" placeholder="Como sua equipe saberá que a solução funcionou?" class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"></textarea>
            </div>
            <div>
              <label class="mb-1.5 block text-sm font-medium text-slate-700">Critérios de aceite <span class="font-normal text-slate-400">(opcional)</span></label>
              <textarea v-model="requestForm.acceptanceCriteria" rows="3" maxlength="5000" placeholder="Ex.: não duplicar pedidos; processar em até 5 minutos; preservar o código externo." class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"></textarea>
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
              <div class="flex flex-wrap items-center gap-2">
                <span :class="statusClass(selectedProcess.status)" class="rounded-full px-2 py-0.5 text-xs font-medium">{{ statusLabel(selectedProcess.status) }}</span>
                <span :class="healthClass(selectedProcess.health)" class="rounded-full px-2 py-0.5 text-xs font-medium">{{ healthLabel(selectedProcess.health) }}</span>
                <span class="font-mono text-xs text-slate-400">{{ selectedProcess.referenceCode }}</span>
              </div>
              <h3 class="mt-3 text-xl font-semibold text-slate-950">{{ selectedProcess.title }}</h3>
            </div>
            <button class="rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Fechar" @click="selectedProcess = null">✕</button>
          </div>
          <div class="space-y-6 p-6">
            <div v-if="!['paused', 'cancelled'].includes(selectedProcess.status)">
              <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Etapa atual</p>
              <ol class="mt-3 grid grid-cols-3 gap-y-3 sm:grid-cols-6">
                <li v-for="(stage, index) in processStages" :key="stage.value" class="relative">
                  <div class="flex items-center">
                    <span
                      class="relative z-10 flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold"
                      :class="stageIndex(selectedProcess.status) >= index ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-400'"
                    >
                      {{ stageIndex(selectedProcess.status) > index ? '✓' : index + 1 }}
                    </span>
                    <span v-if="index < processStages.length - 1" class="h-px flex-1" :class="stageIndex(selectedProcess.status) > index ? 'bg-indigo-600' : 'bg-slate-200'"></span>
                  </div>
                  <p class="mt-1 pr-2 text-[10px] leading-4" :class="stageIndex(selectedProcess.status) === index ? 'font-semibold text-indigo-700' : 'text-slate-500'">
                    {{ stage.label }}
                  </p>
                </li>
              </ol>
            </div>
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Solicitação</p>
              <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{{ selectedProcess.description }}</p>
            </div>
            <div v-if="selectedProcess.objective || selectedProcess.scope || selectedProcess.acceptanceCriteria" class="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div v-if="selectedProcess.objective">
                <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Resultado esperado</p>
                <p class="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-slate-700">{{ selectedProcess.objective }}</p>
              </div>
              <div v-if="selectedProcess.scope">
                <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Escopo</p>
                <p class="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-slate-700">{{ selectedProcess.scope }}</p>
              </div>
              <div v-if="selectedProcess.acceptanceCriteria">
                <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Critérios de aceite</p>
                <p class="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-slate-700">{{ selectedProcess.acceptanceCriteria }}</p>
              </div>
            </div>
            <div v-if="selectedProcess.blockedReason || selectedProcess.nextAction" class="grid gap-3 border-y border-slate-200 py-4">
              <div v-if="selectedProcess.blockedReason">
                <p class="text-xs font-medium text-red-700">Bloqueio</p>
                <p class="mt-1 text-sm text-slate-700">{{ selectedProcess.blockedReason }}</p>
              </div>
              <div v-if="selectedProcess.nextAction">
                <p class="text-xs font-medium text-slate-500">Próximo passo</p>
                <p class="mt-1 text-sm font-medium text-slate-800">{{ selectedProcess.nextAction }}</p>
              </div>
            </div>
            <div v-if="selectedProcess.checklist?.length">
              <div class="flex items-center justify-between gap-3">
                <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Plano de execução</p>
                <span class="text-xs text-slate-500">{{ completedChecklistCount }}/{{ selectedProcess.checklist.length }} concluídos</span>
              </div>
              <ul class="mt-3 space-y-2">
                <li v-for="checkItem in selectedProcess.checklist" :key="checkItem.id" class="flex items-start gap-3 rounded-md border border-slate-200 px-3 py-2.5">
                  <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]"
                    :class="checkItem.status === 'done' ? 'border-emerald-600 bg-emerald-600 text-white' : checkItem.status === 'blocked' ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-300 text-slate-400'">
                    {{ checkItem.status === 'done' ? '✓' : checkItem.status === 'blocked' ? '!' : '' }}
                  </span>
                  <span class="min-w-0">
                    <span class="block text-sm font-medium text-slate-800">{{ checkItem.title }}</span>
                    <span v-if="checkItem.description" class="mt-0.5 block text-xs leading-5 text-slate-500">{{ checkItem.description }}</span>
                    <span v-if="checkItem.dueDate" class="mt-1 block text-xs text-slate-400">Prazo: {{ formatDueDate(checkItem.dueDate) }}</span>
                  </span>
                </li>
              </ul>
            </div>
            <div v-if="selectedProcess.deliveries?.length">
              <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Entregas</p>
              <div class="mt-3 space-y-3">
                <article v-for="delivery in selectedProcess.deliveries" :key="delivery.id" class="rounded-lg border border-slate-200 p-4">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="text-sm font-semibold text-slate-900">{{ delivery.title }}</p>
                      <p class="mt-0.5 text-xs text-slate-500">{{ delivery.version || 'Sem versão' }} · {{ environmentLabel(delivery.environment) }}</p>
                    </div>
                    <span :class="deliveryStatusClass(delivery.status)" class="rounded-full px-2 py-0.5 text-xs font-medium">{{ deliveryStatusLabel(delivery.status) }}</span>
                  </div>
                  <p class="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{{ delivery.summary }}</p>
                  <div v-if="delivery.artifactLinks.length" class="mt-3 flex flex-wrap gap-2">
                    <a v-for="(link, index) in delivery.artifactLinks" :key="link" :href="link" target="_blank" rel="noopener noreferrer" class="text-xs font-medium text-indigo-600 hover:underline">Artefato {{ index + 1 }}</a>
                  </div>
                  <p v-if="delivery.acceptanceNote" class="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">{{ delivery.acceptanceNote }}</p>
                  <div v-if="delivery.status === 'ready'" class="mt-4 flex flex-wrap gap-2">
                    <button :disabled="deliveryActionLoading" class="rounded-md bg-slate-950 px-3 py-2 text-xs font-medium text-white disabled:opacity-50" @click="acceptDelivery(delivery.id)">Aceitar entrega</button>
                    <button :disabled="deliveryActionLoading" class="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-50" @click="openRejectDelivery(delivery.id)">Solicitar ajustes</button>
                  </div>
                </article>
              </div>
            </div>
            <div v-if="processUpdates(selectedProcess).length">
              <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Atividade e comentários</p>
              <ol class="mt-3 space-y-4 border-l border-slate-200 pl-4">
                <li v-for="update in processUpdates(selectedProcess)" :key="update.id" class="relative">
                  <span class="absolute -left-[1.29rem] top-1.5 h-2 w-2 rounded-full ring-4 ring-white" :class="update.kind === 'comment' ? 'bg-slate-500' : update.kind === 'delivery' ? 'bg-emerald-600' : 'bg-indigo-600'"></span>
                  <p class="text-sm leading-6 text-slate-700">{{ update.message }}</p>
                  <p class="mt-1 text-xs text-slate-400">{{ update.authorRole === 'client' ? 'Sua equipe' : 'Chave Mestra' }} · {{ formatDateTime(update.createdAt) }}<span v-if="update.editedAt"> · editado</span></p>
                </li>
              </ol>
            </div>
            <form v-if="selectedProcess.clientCanComment" class="rounded-lg border border-slate-200 p-4" @submit.prevent="submitComment">
              <label class="text-sm font-medium text-slate-800">Comentar ou tirar uma dúvida</label>
              <textarea v-model="commentMessage" required maxlength="5000" rows="3" placeholder="Escreva uma mensagem para a equipe responsável" class="mt-2 w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"></textarea>
              <div class="mt-2 flex items-center justify-between gap-3">
                <p v-if="commentError" class="text-xs text-red-700">{{ commentError }}</p>
                <span v-else class="text-xs text-slate-400">A mensagem ficará registrada nesta demanda.</span>
                <button :disabled="commentSubmitting || !commentMessage.trim()" class="shrink-0 rounded-md bg-slate-950 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">{{ commentSubmitting ? 'Enviando…' : 'Enviar comentário' }}</button>
              </div>
            </form>
            <dl class="grid grid-cols-2 gap-4 border-t border-slate-200 pt-5">
              <div><dt class="text-xs text-slate-400">Posição</dt><dd class="mt-1 text-sm font-medium text-slate-800">{{ selectedProcess.position ? `#${selectedProcess.position}` : '—' }}</dd></div>
              <div><dt class="text-xs text-slate-400">Previsão</dt><dd class="mt-1 text-sm font-medium text-slate-800">{{ deliveryLabel(selectedProcess) }}</dd></div>
              <div><dt class="text-xs text-slate-400">Complexidade</dt><dd class="mt-1 text-sm font-medium text-slate-800">{{ complexityLabel(selectedProcess.complexity) }}</dd></div>
              <div><dt class="text-xs text-slate-400">Solicitado em</dt><dd class="mt-1 text-sm font-medium text-slate-800">{{ formatDate(selectedProcess.createdAt) }}</dd></div>
            </dl>
            <div v-if="selectedProcess.integrations?.length" class="border-t border-slate-200 pt-5">
              <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Automações relacionadas</p>
              <div class="mt-3 space-y-2">
                <button
                  v-for="integration in selectedProcess.integrations"
                  :key="integration.id"
                  class="flex w-full items-center justify-between rounded-md border border-slate-200 px-3 py-3 text-left hover:bg-slate-50"
                  @click="openAutomation(integration.id)"
                >
                  <span>
                    <span class="block text-sm font-medium text-slate-900">{{ integration.name }}</span>
                    <span class="mt-0.5 block font-mono text-xs text-slate-500">{{ integration.functionName }}</span>
                  </span>
                  <span class="text-xs font-medium text-indigo-600">Ver monitoramento</span>
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="rejectDeliveryId" class="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-slate-950/55" @click="closeRejectDelivery"></div>
        <form class="relative w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl" @submit.prevent="rejectDelivery">
          <h3 class="text-lg font-semibold text-slate-950">Solicitar ajustes</h3>
          <p class="mt-1 text-sm text-slate-500">Explique objetivamente o que não passou na validação.</p>
          <textarea v-model="rejectionNote" required maxlength="3000" rows="5" class="mt-4 w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900" placeholder="Ex.: o campo CNPJ precisa manter os zeros à esquerda."></textarea>
          <p v-if="deliveryActionError" class="mt-2 text-sm text-red-700">{{ deliveryActionError }}</p>
          <div class="mt-5 flex justify-end gap-2">
            <button type="button" class="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium" @click="closeRejectDelivery">Cancelar</button>
            <button :disabled="deliveryActionLoading" class="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{{ deliveryActionLoading ? 'Enviando…' : 'Enviar ajustes' }}</button>
          </div>
        </form>
      </div>
    </transition>

    <div v-if="successMessage" class="fixed bottom-5 right-5 z-50 rounded-md bg-slate-950 px-4 py-3 text-sm font-medium text-white shadow-lg">
      {{ successMessage }}
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useApi } from '@/composables/useApi'
import { useAuthStore } from '@/stores/auth'
import { formatCalendarDate, formatInstant } from '@/utils/dates'
import type { ProcessItem, ProcessStatus } from '@/types'

defineProps<{ mode: 'overview' | 'queue' }>()
const emit = defineEmits<{ openQueue: []; openAutomation: [integrationId: number] }>()

const api = useApi()
const auth = useAuthStore()
const processes = ref<ProcessItem[]>([])
const loading = ref(true)
const queueFilter = ref<'active' | 'delivered' | 'all'>('active')
const queueSearch = ref('')
const requestModalOpen = ref(false)
const selectedProcess = ref<ProcessItem | null>(null)
const submitting = ref(false)
const requestError = ref('')
const successMessage = ref('')
const loadError = ref('')
const requestForm = ref({ title: '', category: 'automation', description: '', objective: '', acceptanceCriteria: '' })
const commentMessage = ref('')
const commentSubmitting = ref(false)
const commentError = ref('')
const rejectDeliveryId = ref<number | null>(null)
const rejectionNote = ref('')
const deliveryActionLoading = ref(false)
const deliveryActionError = ref('')
let refreshTimer: ReturnType<typeof setInterval> | null = null
let streamRetryTimer: ReturnType<typeof setTimeout> | null = null
let streamRefreshTimer: ReturnType<typeof setTimeout> | null = null
let streamAbortController: AbortController | null = null
let componentDisposed = false

const activeStatuses: ProcessStatus[] = ['requested', 'analysis', 'queued', 'in_progress', 'validation', 'paused']
const activeProcesses = computed(() => processes.value.filter(item => activeStatuses.includes(item.status)).slice(0, 5))
const filteredProcesses = computed(() => {
  let values = processes.value
  if (queueFilter.value === 'delivered') values = values.filter(item => item.status === 'delivered')
  if (queueFilter.value === 'active') values = values.filter(item => activeStatuses.includes(item.status))
  const search = queueSearch.value.trim().toLocaleLowerCase('pt-BR')
  if (search) {
    values = values.filter(item => [item.referenceCode, item.title, item.description, item.latestUpdate, item.nextAction]
      .some(value => value?.toLocaleLowerCase('pt-BR').includes(search)))
  }
  return values
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
const processStages: Array<{ value: ProcessStatus; label: string }> = [
  { value: 'requested', label: 'Recebida' },
  { value: 'analysis', label: 'Análise' },
  { value: 'queued', label: 'Fila' },
  { value: 'in_progress', label: 'Desenvolvimento' },
  { value: 'validation', label: 'Validação' },
  { value: 'delivered', label: 'Entregue' }
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
const healthLabel = (health: ProcessItem['health']) => ({
  on_track: 'No prazo', at_risk: 'Em risco', off_track: 'Fora do plano', blocked: 'Bloqueada'
}[health])
const healthClass = (health: ProcessItem['health']) => ({
  on_track: 'bg-emerald-50 text-emerald-700', at_risk: 'bg-amber-100 text-amber-800',
  off_track: 'bg-red-100 text-red-800', blocked: 'bg-red-100 text-red-800'
}[health])
const environmentLabel = (environment: 'development' | 'staging' | 'production') => ({
  development: 'Desenvolvimento', staging: 'Homologação', production: 'Produção'
}[environment])
const deliveryStatusLabel = (status: 'draft' | 'ready' | 'accepted' | 'rejected') => ({
  draft: 'Rascunho', ready: 'Aguardando aceite', accepted: 'Aceita', rejected: 'Ajustes solicitados'
}[status])
const deliveryStatusClass = (status: 'draft' | 'ready' | 'accepted' | 'rejected') => ({
  draft: 'bg-slate-100 text-slate-700', ready: 'bg-violet-100 text-violet-800',
  accepted: 'bg-emerald-100 text-emerald-800', rejected: 'bg-amber-100 text-amber-800'
}[status])
const categoryLabel = (category: ProcessItem['category']) => ({
  automation: 'Automação', integration: 'Integração', maintenance: 'Manutenção', improvement: 'Melhoria', support: 'Suporte'
}[category])
const complexityLabel = (complexity: ProcessItem['complexity']) => complexity ? ({ simple: 'Simples', medium: 'Média', complex: 'Complexa' }[complexity]) : 'Em análise'
const dateOptions: Intl.DateTimeFormatOptions = {
  day: '2-digit', month: 'short', year: 'numeric'
}
const formatDate = (date: string) => formatInstant(date, dateOptions)
const formatDueDate = (date: string) => formatCalendarDate(date, dateOptions)
const formatDateTime = (date: string) => formatInstant(date, {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
})
const stageIndex = (status: ProcessStatus) => processStages.findIndex(stage => stage.value === status)
const processUpdates = (item: ProcessItem) => {
  if (item.updates?.length) return item.updates
  if (item.latestUpdate) {
    return [{
      id: -item.id, parentId: null, kind: 'update' as const, visibility: 'client' as const,
      message: item.latestUpdate, metadata: {}, authorId: null, authorEmail: null,
      authorRole: 'admin' as const, editedAt: null, createdAt: item.updatedAt
    }]
  }
  return []
}
const completedChecklistCount = computed(() =>
  selectedProcess.value?.checklist?.filter(item => item.status === 'done').length || 0
)
const deliveryLabel = (item: ProcessItem) => {
  if (item.status === 'delivered' && item.deliveredAt) return formatDate(item.deliveredAt)
  if (item.dueDate) return formatDueDate(item.dueDate)
  if (item.estimateBusinessDays) return `${item.estimateBusinessDays} dias úteis`
  return item.status === 'requested' || item.status === 'analysis' ? 'Após análise' : 'A definir'
}

const fetchProcesses = async (silent = false) => {
  if (!silent) loading.value = true
  loadError.value = ''
  try {
    const data = await api.get<{ processes: ProcessItem[] }>('/processes')
    processes.value = data.processes
    if (selectedProcess.value) {
      selectedProcess.value = data.processes.find(item => item.id === selectedProcess.value?.id) || null
    }
  } catch (error) {
    if (!silent) loadError.value = error instanceof Error ? error.message : 'Tente novamente em alguns instantes.'
  } finally {
    if (!silent) loading.value = false
  }
}
const openAutomation = (integrationId: number) => {
  selectedProcess.value = null
  emit('openAutomation', integrationId)
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
    requestForm.value = { title: '', category: 'automation', description: '', objective: '', acceptanceCriteria: '' }
    closeRequestModal()
    successMessage.value = 'Solicitação enviada para análise'
    setTimeout(() => { successMessage.value = '' }, 3500)
  } catch (error) {
    requestError.value = error instanceof Error ? error.message : 'Não foi possível enviar a solicitação'
  } finally {
    submitting.value = false
  }
}

const submitComment = async () => {
  if (!selectedProcess.value || !commentMessage.value.trim()) return
  commentSubmitting.value = true
  commentError.value = ''
  try {
    await api.post(`/processes/${selectedProcess.value.id}/comments`, { message: commentMessage.value.trim() })
    commentMessage.value = ''
    await fetchProcesses(true)
    successMessage.value = 'Comentário enviado'
    setTimeout(() => { successMessage.value = '' }, 3000)
  } catch (error) {
    commentError.value = error instanceof Error ? error.message : 'Não foi possível enviar o comentário'
  } finally {
    commentSubmitting.value = false
  }
}
const acceptDelivery = async (deliveryId: number) => {
  if (!selectedProcess.value) return
  deliveryActionLoading.value = true
  deliveryActionError.value = ''
  try {
    await api.patch(`/processes/${selectedProcess.value.id}/deliveries/${deliveryId}`, { status: 'accepted' })
    await fetchProcesses(true)
    successMessage.value = 'Entrega aceita com sucesso'
    setTimeout(() => { successMessage.value = '' }, 3000)
  } catch (error) {
    deliveryActionError.value = error instanceof Error ? error.message : 'Não foi possível aceitar a entrega'
  } finally {
    deliveryActionLoading.value = false
  }
}
const openRejectDelivery = (deliveryId: number) => {
  rejectDeliveryId.value = deliveryId
  rejectionNote.value = ''
  deliveryActionError.value = ''
}
const closeRejectDelivery = () => {
  rejectDeliveryId.value = null
  rejectionNote.value = ''
  deliveryActionError.value = ''
}
const rejectDelivery = async () => {
  if (!selectedProcess.value || !rejectDeliveryId.value || !rejectionNote.value.trim()) return
  deliveryActionLoading.value = true
  deliveryActionError.value = ''
  try {
    await api.patch(`/processes/${selectedProcess.value.id}/deliveries/${rejectDeliveryId.value}`, {
      status: 'rejected',
      acceptanceNote: rejectionNote.value.trim()
    })
    closeRejectDelivery()
    await fetchProcesses(true)
    successMessage.value = 'Ajustes enviados para a equipe'
    setTimeout(() => { successMessage.value = '' }, 3000)
  } catch (error) {
    deliveryActionError.value = error instanceof Error ? error.message : 'Não foi possível solicitar ajustes'
  } finally {
    deliveryActionLoading.value = false
  }
}

const scheduleStreamRefresh = () => {
  if (streamRefreshTimer) clearTimeout(streamRefreshTimer)
  streamRefreshTimer = setTimeout(() => void fetchProcesses(true), 250)
}
const connectProcessStream = async () => {
  if (!auth.token || componentDisposed) return
  streamAbortController?.abort()
  streamAbortController = new AbortController()
  try {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/processes/stream/events`, {
      headers: { Authorization: `Bearer ${auth.token}`, Accept: 'text/event-stream' },
      signal: streamAbortController.signal
    })
    if (!response.ok || !response.body) throw new Error('Fluxo em tempo real indisponível')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (!componentDisposed) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split('\n\n')
      buffer = events.pop() || ''
      for (const event of events) {
        if (event.includes('event: process-change')) scheduleStreamRefresh()
      }
    }
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      console.info('Atualização em tempo real temporariamente indisponível; usando sincronização periódica.')
    }
  } finally {
    if (!componentDisposed) streamRetryTimer = setTimeout(() => void connectProcessStream(), 5_000)
  }
}

onMounted(async () => {
  await fetchProcesses()
  void connectProcessStream()
  refreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible') void fetchProcesses(true)
  }, 20_000)
})
onBeforeUnmount(() => {
  componentDisposed = true
  streamAbortController?.abort()
  if (refreshTimer) clearInterval(refreshTimer)
  if (streamRetryTimer) clearTimeout(streamRetryTimer)
  if (streamRefreshTimer) clearTimeout(streamRefreshTimer)
})
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active { transition: opacity 0.18s ease; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }
</style>
