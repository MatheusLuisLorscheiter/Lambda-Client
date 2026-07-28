<template>
  <section>
    <div class="grid gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-4">
      <button v-for="summary in summaries" :key="summary.label" class="bg-white p-4 text-left hover:bg-slate-50" @click="applySummaryFilter(summary.filter)">
        <p class="text-xs font-medium text-slate-500">{{ summary.label }}</p>
        <p class="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{{ summary.value }}</p>
      </button>
    </div>

    <div class="mt-5 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
      <div class="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap">
        <label class="min-w-60 flex-1">
          <span class="mb-1 block text-xs font-medium text-slate-500">Buscar</span>
          <input v-model="searchFilter" type="search" placeholder="Código, título, empresa, tag ou próximo passo" class="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900">
        </label>
        <label>
          <span class="mb-1 block text-xs font-medium text-slate-500">Empresa</span>
          <select v-model="companyFilter" class="min-h-10 min-w-52 rounded-md border border-slate-300 bg-white px-3 text-sm">
            <option value="">Todas as empresas</option>
            <option v-for="company in companies" :key="company.id" :value="String(company.id)">{{ company.name }}</option>
          </select>
        </label>
        <label>
          <span class="mb-1 block text-xs font-medium text-slate-500">Status</span>
          <select v-model="statusFilter" class="min-h-10 min-w-48 rounded-md border border-slate-300 bg-white px-3 text-sm">
            <option value="">Todos os status</option>
            <option value="intake">Recebidas / análise</option>
            <option value="execution">Em execução / validação</option>
            <option v-for="status in statuses" :key="status.value" :value="status.value">{{ status.label }}</option>
          </select>
        </label>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <div class="grid grid-cols-2 rounded-md border border-slate-300 p-0.5" aria-label="Modo de visualização">
          <button class="rounded px-2.5 py-1.5 text-xs font-medium" :class="viewMode === 'list' ? 'bg-slate-100 text-slate-950' : 'text-slate-500'" @click="viewMode = 'list'">Lista</button>
          <button class="rounded px-2.5 py-1.5 text-xs font-medium" :class="viewMode === 'board' ? 'bg-slate-100 text-slate-950' : 'text-slate-500'" @click="viewMode = 'board'">Quadro</button>
        </div>
        <button class="min-h-10 rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800" @click="openCreate">Adicionar demanda</button>
      </div>
    </div>

    <div v-if="activeFilters.length" class="mt-3 flex flex-wrap items-center gap-2 text-xs">
      <span class="text-slate-400">Filtros ativos:</span>
      <button v-for="filter in activeFilters" :key="filter.label" class="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600 hover:bg-slate-200" @click="filter.clear">
        {{ filter.label }} ×
      </button>
      <button class="font-medium text-slate-600 underline underline-offset-2" @click="clearFilters">Limpar tudo</button>
    </div>

    <div v-if="loading" class="mt-5 rounded-lg border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">Carregando processos…</div>
    <div v-else-if="loadError" class="mt-5 rounded-lg border border-red-200 bg-red-50 p-8 text-center">
      <p class="text-sm font-medium text-red-800">Não foi possível carregar os processos</p>
      <p class="mt-1 text-sm text-red-700">{{ loadError }}</p>
      <button class="mt-3 rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-800" @click="fetchProcesses">Tentar novamente</button>
    </div>

    <div v-else-if="viewMode === 'list'" class="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div v-if="filteredProcesses.length" class="divide-y divide-slate-100">
        <button
          v-for="item in filteredProcesses"
          :key="item.id"
          class="grid w-full gap-3 px-4 py-4 text-left hover:bg-slate-50 sm:px-5 lg:grid-cols-[minmax(0,1fr)_180px_145px_110px]"
          @click="openEdit(item)"
        >
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span :class="statusClass(item.status)" class="rounded-full px-2 py-0.5 text-xs font-medium">{{ statusLabel(item.status) }}</span>
              <span class="font-mono text-xs text-slate-400">{{ item.referenceCode }}</span>
              <span v-if="item.position && item.status === 'queued'" class="text-xs font-medium text-slate-500">Fila #{{ item.position }}</span>
              <span v-if="item.health !== 'on_track'" :class="healthClass(item.health)" class="rounded-full px-2 py-0.5 text-xs font-medium">{{ healthLabel(item.health) }}</span>
            </div>
            <p class="mt-2 truncate font-medium text-slate-950">{{ item.title }}</p>
            <p class="mt-1 truncate text-sm text-slate-500">{{ item.nextAction || item.latestUpdate || item.description }}</p>
            <div v-if="item.tags?.length || item.integrations?.length" class="mt-2 flex flex-wrap gap-1.5">
              <span v-for="tag in item.tags?.slice(0, 3)" :key="tag" class="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">{{ tag }}</span>
              <span v-if="item.integrations?.length" class="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700">{{ item.integrations.length }} automação{{ item.integrations.length === 1 ? '' : 'ões' }}</span>
            </div>
          </div>
          <div><p class="text-xs text-slate-400">Empresa</p><p class="mt-1 truncate text-sm font-medium text-slate-700">{{ item.companyName }}</p></div>
          <div><p class="text-xs text-slate-400">Previsão</p><p class="mt-1 text-sm text-slate-700">{{ item.dueDate ? formatDate(item.dueDate) : 'A definir' }}</p></div>
          <div>
            <div class="flex items-center justify-between"><p class="text-xs text-slate-400">Progresso</p><p class="text-xs font-medium text-slate-600">{{ item.progress }}%</p></div>
            <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div class="h-full rounded-full bg-slate-700" :style="{ width: `${item.progress}%` }"></div></div>
          </div>
        </button>
      </div>
      <div v-else class="px-6 py-14 text-center">
        <p class="text-sm font-medium text-slate-700">Nenhum processo encontrado</p>
        <p class="mt-1 text-xs text-slate-500">Ajuste os filtros ou adicione uma nova demanda.</p>
      </div>
    </div>

    <div v-else class="mt-5 overflow-x-auto pb-2">
      <div class="grid min-w-[1120px] grid-cols-5 gap-3">
        <section v-for="column in boardColumns" :key="column.key" class="rounded-lg border border-slate-200 bg-slate-50">
          <header class="flex items-center justify-between border-b border-slate-200 px-3 py-3">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-slate-600">{{ column.label }}</h3>
            <span class="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500">{{ column.items.length }}</span>
          </header>
          <div class="space-y-2 p-2">
            <button v-for="item in column.items" :key="item.id" class="block w-full rounded-md border border-slate-200 bg-white p-3 text-left hover:border-slate-300" @click="openEdit(item)">
              <div class="flex items-center justify-between gap-2">
                <span class="font-mono text-[11px] text-slate-400">{{ item.referenceCode }}</span>
                <span v-if="item.health !== 'on_track'" :class="healthClass(item.health)" class="rounded-full px-1.5 py-0.5 text-[10px] font-medium">{{ healthLabel(item.health) }}</span>
              </div>
              <p class="mt-2 line-clamp-2 text-sm font-medium leading-5 text-slate-900">{{ item.title }}</p>
              <p class="mt-1 truncate text-xs text-slate-500">{{ item.companyName }}</p>
              <div class="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                <span>{{ item.dueDate ? formatDate(item.dueDate) : 'Sem prazo' }}</span>
                <span>{{ item.progress }}%</span>
              </div>
              <div class="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100"><div class="h-full bg-slate-700" :style="{ width: `${item.progress}%` }"></div></div>
            </button>
            <p v-if="!column.items.length" class="px-2 py-8 text-center text-xs text-slate-400">Nenhum item</p>
          </div>
        </section>
      </div>
    </div>

    <transition name="fade">
      <div v-if="editorOpen" class="fixed inset-0 z-50">
        <div class="absolute inset-0 bg-slate-950/50" @click="closeEditor"></div>
        <aside class="absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col border-l border-slate-200 bg-white shadow-xl">
          <form class="flex min-h-0 flex-1 flex-col" @submit.prevent="saveProcess">
            <header class="border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="text-lg font-semibold text-slate-950">{{ editor.id ? editor.title || 'Atualizar processo' : 'Adicionar processo' }}</h3>
                    <span v-if="editor.id" class="font-mono text-xs text-slate-400">{{ selectedEditorProcess?.referenceCode }}</span>
                  </div>
                  <p class="mt-0.5 text-sm text-slate-500">{{ editor.id ? selectedEditorProcess?.companyName : 'Registre o contexto antes de planejar a execução.' }}</p>
                </div>
                <button type="button" class="rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Fechar" @click="closeEditor">✕</button>
              </div>
              <nav class="mt-4 flex gap-5 overflow-x-auto" aria-label="Etapas do editor">
                <button
                  v-for="tab in editorTabs"
                  :key="tab.value"
                  type="button"
                  class="whitespace-nowrap border-b-2 pb-2 text-sm font-medium"
                  :class="editorTab === tab.value ? 'border-slate-950 text-slate-950' : 'border-transparent text-slate-500 hover:text-slate-800'"
                  @click="editorTab = tab.value"
                >
                  {{ tab.label }}<span v-if="tab.count !== null" class="ml-1 text-xs text-slate-400">{{ tab.count }}</span>
                </button>
              </nav>
            </header>

            <div class="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
              <section v-if="editorTab === 'context'" class="space-y-5">
                <div v-if="!editor.id">
                  <label class="mb-1.5 block text-sm font-medium text-slate-700">Empresa</label>
                  <select v-model="editor.companyId" required class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="">Selecione uma empresa</option><option v-for="company in companies" :key="company.id" :value="String(company.id)">{{ company.name }}</option></select>
                </div>
                <div><label class="mb-1.5 block text-sm font-medium text-slate-700">Título</label><input v-model="editor.title" required maxlength="160" placeholder="Resultado ou problema em uma frase" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm"></div>
                <div><label class="mb-1.5 block text-sm font-medium text-slate-700">Contexto atual</label><textarea v-model="editor.description" required rows="5" maxlength="5000" placeholder="Como o processo funciona hoje e qual é o gargalo?" class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm"></textarea></div>
                <div class="grid gap-4">
                  <div><label class="mb-1.5 block text-sm font-medium text-slate-700">Resultado esperado</label><textarea v-model="editor.objective" rows="3" maxlength="3000" placeholder="Como saberemos que a solução funcionou?" class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm"></textarea></div>
                  <div><label class="mb-1.5 block text-sm font-medium text-slate-700">Escopo</label><textarea v-model="editor.scope" rows="3" maxlength="5000" placeholder="O que está dentro e fora desta entrega?" class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm"></textarea></div>
                  <div><label class="mb-1.5 block text-sm font-medium text-slate-700">Critérios de aceite</label><textarea v-model="editor.acceptanceCriteria" rows="3" maxlength="5000" placeholder="Condições objetivas para considerar o trabalho aceito" class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm"></textarea></div>
                </div>
                <div><label class="mb-1.5 block text-sm font-medium text-slate-700">Tags</label><input v-model="editor.tagsText" maxlength="800" placeholder="financeiro, omie, pedidos" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm"><p class="mt-1 text-xs text-slate-400">Separe por vírgulas.</p></div>
                <label class="flex items-center justify-between rounded-md border border-slate-200 px-3 py-3">
                  <span><span class="block text-sm font-medium text-slate-700">Comentários do cliente</span><span class="mt-0.5 block text-xs text-slate-400">Permite dúvidas e validações dentro do processo.</span></span>
                  <input v-model="editor.clientCanComment" type="checkbox" class="h-4 w-4 rounded border-slate-300">
                </label>
              </section>

              <section v-else-if="editorTab === 'planning'" class="space-y-5">
                <div class="grid gap-4 sm:grid-cols-2">
                  <div><label class="mb-1.5 block text-sm font-medium text-slate-700">Status</label><select v-model="editor.status" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm"><option v-for="status in statuses" :key="status.value" :value="status.value">{{ status.label }}</option></select></div>
                  <div><label class="mb-1.5 block text-sm font-medium text-slate-700">Categoria</label><select v-model="editor.category" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="automation">Automação</option><option value="integration">Integração</option><option value="improvement">Melhoria</option><option value="maintenance">Manutenção</option><option value="support">Suporte</option></select></div>
                  <div><label class="mb-1.5 block text-sm font-medium text-slate-700">Prioridade</label><select v-model="editor.priority" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></div>
                  <div><label class="mb-1.5 block text-sm font-medium text-slate-700">Impacto no negócio</label><select v-model="editor.impact" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="low">Baixo</option><option value="medium">Médio</option><option value="high">Alto</option><option value="critical">Crítico</option></select></div>
                  <div><label class="mb-1.5 block text-sm font-medium text-slate-700">Saúde do trabalho</label><select v-model="editor.health" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="on_track">No prazo</option><option value="at_risk">Em risco</option><option value="off_track">Fora do plano</option><option value="blocked">Bloqueado</option></select></div>
                  <div><label class="mb-1.5 block text-sm font-medium text-slate-700">Complexidade</label><select v-model="editor.complexity" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="">A definir</option><option value="simple">Simples</option><option value="medium">Média</option><option value="complex">Complexa</option></select></div>
                  <div><label class="mb-1.5 block text-sm font-medium text-slate-700">Data da solicitação</label><input v-model="editor.createdAt" type="date" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm"></div>
                  <div><label class="mb-1.5 block text-sm font-medium text-slate-700">Estimativa (dias úteis)</label><input v-model.number="editor.estimateBusinessDays" type="number" min="1" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm"></div>
                  <div><label class="mb-1.5 block text-sm font-medium text-slate-700">Início planejado</label><input v-model="editor.plannedStart" type="date" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm"></div>
                  <div><label class="mb-1.5 block text-sm font-medium text-slate-700">Previsão de entrega</label><input v-model="editor.dueDate" type="date" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm"></div>
                  <div v-if="editor.status === 'queued'"><label class="mb-1.5 block text-sm font-medium text-slate-700">Posição na fila</label><input v-model.number="editor.position" type="number" min="1" placeholder="Automática" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm"></div>
                  <div v-if="editor.status === 'delivered'"><label class="mb-1.5 block text-sm font-medium text-slate-700">Data da entrega</label><input v-model="editor.deliveredAt" type="date" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm"></div>
                </div>
                <div v-if="editor.health === 'blocked'"><label class="mb-1.5 block text-sm font-medium text-red-700">Motivo do bloqueio</label><textarea v-model="editor.blockedReason" required rows="3" maxlength="2000" class="w-full resize-none rounded-md border border-red-300 px-3 py-2.5 text-sm"></textarea></div>
                <div><label class="mb-1.5 block text-sm font-medium text-slate-700">Próximo passo</label><textarea v-model="editor.nextAction" rows="2" maxlength="2000" placeholder="Ação, responsável e resultado esperado" class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm"></textarea></div>
                <div>
                  <div class="mb-1.5 flex justify-between"><label class="text-sm font-medium text-slate-700">Progresso</label><span class="text-sm font-medium text-slate-500">{{ editor.progress }}%</span></div>
                  <input v-model.number="editor.progress" type="range" min="0" max="100" step="5" class="w-full accent-slate-900">
                  <div class="mt-1 flex justify-between text-[11px] text-slate-400"><span>Não iniciado</span><span>Entregue</span></div>
                </div>
              </section>

              <section v-else-if="editorTab === 'execution'" class="space-y-7">
                <div v-if="!editor.id" class="rounded-lg border border-dashed border-slate-300 px-5 py-12 text-center"><p class="text-sm font-medium text-slate-700">Salve o processo primeiro</p><p class="mt-1 text-xs text-slate-500">Depois você poderá criar etapas e registrar entregas.</p></div>
                <template v-else>
                  <section>
                    <div class="flex items-center justify-between gap-3"><div><h4 class="text-sm font-semibold text-slate-900">Plano de execução</h4><p class="mt-0.5 text-xs text-slate-400">Etapas objetivas acompanhadas pelo cliente.</p></div><button type="button" class="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium" @click="openChecklistModal">Adicionar etapa</button></div>
                    <div v-if="editor.checklist.length" class="mt-4 overflow-hidden rounded-md border border-slate-200">
                      <article v-for="checkItem in editor.checklist" :key="checkItem.id" class="flex items-start gap-3 border-b border-slate-100 px-3 py-3 last:border-0">
                        <select :value="checkItem.status" class="rounded border border-slate-200 bg-white px-2 py-1 text-xs" @change="updateChecklistStatusFromEvent(checkItem.id, $event)"><option value="todo">A fazer</option><option value="in_progress">Em andamento</option><option value="done">Concluída</option><option value="blocked">Bloqueada</option></select>
                        <div class="min-w-0 flex-1"><p class="text-sm font-medium text-slate-800">{{ checkItem.title }}</p><p v-if="checkItem.description" class="mt-1 text-xs leading-5 text-slate-500">{{ checkItem.description }}</p><p v-if="checkItem.dueDate" class="mt-1 text-[11px] text-slate-400">Prazo: {{ formatDate(checkItem.dueDate) }}</p></div>
                        <button type="button" class="text-xs font-medium text-red-600" @click="checkItemToDelete = checkItem.id">Remover</button>
                      </article>
                    </div>
                    <p v-else class="mt-4 rounded-md border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">Nenhuma etapa cadastrada.</p>
                  </section>
                  <section class="border-t border-slate-200 pt-6">
                    <div class="flex items-center justify-between gap-3"><div><h4 class="text-sm font-semibold text-slate-900">Entregas</h4><p class="mt-0.5 text-xs text-slate-400">Versões enviadas para validação.</p></div><button type="button" class="rounded-md bg-slate-950 px-3 py-2 text-xs font-medium text-white" @click="openDeliveryModal">Registrar entrega</button></div>
                    <div v-if="editor.deliveries.length" class="mt-4 space-y-2">
                      <article v-for="delivery in editor.deliveries" :key="delivery.id" class="rounded-md border border-slate-200 p-4">
                        <div class="flex items-start justify-between gap-3"><div><p class="text-sm font-medium text-slate-800">{{ delivery.title }}</p><p class="mt-0.5 text-xs text-slate-400">{{ delivery.version || 'Sem versão' }} · {{ environmentLabel(delivery.environment) }}</p></div><span :class="deliveryStatusClass(delivery.status)" class="rounded-full px-2 py-0.5 text-xs font-medium">{{ deliveryStatusLabel(delivery.status) }}</span></div>
                        <p class="mt-2 text-xs leading-5 text-slate-500">{{ delivery.summary }}</p>
                      </article>
                    </div>
                    <p v-else class="mt-4 rounded-md border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">Nenhuma entrega registrada.</p>
                  </section>
                </template>
              </section>

              <section v-else class="space-y-6">
                <div>
                  <label class="mb-1.5 block text-sm font-medium text-slate-700">{{ editor.id ? 'Nova atualização para o cliente' : 'Atualização inicial' }}</label>
                  <textarea v-model="editor.latestUpdate" rows="4" maxlength="5000" placeholder="O que mudou, qual é o próximo passo e existe alguma dependência?" class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm"></textarea>
                  <p v-if="editor.id" class="mt-1 text-xs text-slate-400">Deixe em branco quando estiver alterando apenas os dados do processo.</p>
                </div>
                <div v-if="editor.updates.length">
                  <h4 class="text-sm font-semibold text-slate-900">Histórico</h4>
                  <ol class="mt-4 space-y-4 border-l border-slate-200 pl-4">
                    <li v-for="update in editor.updates" :key="update.id" class="relative">
                      <span class="absolute -left-[1.29rem] top-1.5 h-2 w-2 rounded-full bg-slate-600 ring-4 ring-white"></span>
                      <div class="flex flex-wrap items-center gap-2"><span class="text-xs font-medium text-slate-500">{{ update.kind === 'comment' ? 'Comentário' : update.kind === 'delivery' ? 'Entrega' : 'Atualização' }}</span><span v-if="update.visibility === 'internal'" class="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Interno</span></div>
                      <p class="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{{ update.message }}</p>
                      <p class="mt-1 text-xs text-slate-400">{{ formatDateTime(update.createdAt) }}</p>
                    </li>
                  </ol>
                </div>
                <p v-else class="rounded-md border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">O histórico aparecerá após a primeira atualização.</p>
              </section>

              <p v-if="formError" class="mt-5 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{{ formError }}</p>
            </div>

            <footer class="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-6">
              <p class="hidden text-xs text-slate-400 sm:block">{{ editor.id ? `Versão ${selectedEditorProcess?.version || 1}` : 'Novo registro' }}</p>
              <div class="ml-auto flex gap-2"><button type="button" class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" @click="closeEditor">Cancelar</button><button :disabled="saving" class="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{{ saving ? 'Salvando…' : 'Salvar processo' }}</button></div>
            </footer>
          </form>
        </aside>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="checklistModalOpen" class="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-slate-950/55" @click="checklistModalOpen = false"></div>
        <form class="relative w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-xl" @submit.prevent="createChecklistItem">
          <h3 class="text-lg font-semibold text-slate-950">Adicionar etapa</h3>
          <p class="mt-1 text-sm text-slate-500">Crie uma etapa objetiva, verificável e com prazo quando necessário.</p>
          <div class="mt-5 space-y-4"><div><label class="mb-1.5 block text-sm font-medium">Título</label><input v-model="checklistForm.title" required maxlength="240" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm"></div><div><label class="mb-1.5 block text-sm font-medium">Descrição</label><textarea v-model="checklistForm.description" rows="3" maxlength="3000" class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm"></textarea></div><div><label class="mb-1.5 block text-sm font-medium">Prazo</label><input v-model="checklistForm.dueDate" type="date" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm"></div></div>
          <p v-if="secondaryFormError" class="mt-3 text-sm text-red-700">{{ secondaryFormError }}</p>
          <div class="mt-5 flex justify-end gap-2"><button type="button" class="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium" @click="checklistModalOpen = false">Cancelar</button><button :disabled="secondarySaving" class="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{{ secondarySaving ? 'Salvando…' : 'Adicionar etapa' }}</button></div>
        </form>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="deliveryModalOpen" class="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-slate-950/55" @click="deliveryModalOpen = false"></div>
        <form class="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-xl" @submit.prevent="createDelivery">
          <h3 class="text-lg font-semibold text-slate-950">Registrar entrega</h3>
          <p class="mt-1 text-sm text-slate-500">Documente o pacote liberado e envie para validação do cliente.</p>
          <div class="mt-5 grid gap-4 sm:grid-cols-2"><div class="sm:col-span-2"><label class="mb-1.5 block text-sm font-medium">Título</label><input v-model="deliveryForm.title" required maxlength="240" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm"></div><div><label class="mb-1.5 block text-sm font-medium">Versão</label><input v-model="deliveryForm.version" maxlength="80" placeholder="v1.2.0" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm"></div><div><label class="mb-1.5 block text-sm font-medium">Ambiente</label><select v-model="deliveryForm.environment" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="development">Desenvolvimento</option><option value="staging">Homologação</option><option value="production">Produção</option></select></div><div class="sm:col-span-2"><label class="mb-1.5 block text-sm font-medium">Resumo da entrega</label><textarea v-model="deliveryForm.summary" required rows="4" maxlength="5000" class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm"></textarea></div><div class="sm:col-span-2"><label class="mb-1.5 block text-sm font-medium">Notas da versão</label><textarea v-model="deliveryForm.releaseNotes" rows="3" class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm"></textarea></div><div class="sm:col-span-2"><label class="mb-1.5 block text-sm font-medium">Plano de reversão</label><textarea v-model="deliveryForm.rollbackPlan" rows="3" class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm"></textarea></div><div class="sm:col-span-2"><label class="mb-1.5 block text-sm font-medium">Links de artefatos</label><textarea v-model="deliveryForm.artifactLinksText" rows="3" placeholder="Um link http/https por linha" class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 font-mono text-sm"></textarea></div></div>
          <p v-if="secondaryFormError" class="mt-3 text-sm text-red-700">{{ secondaryFormError }}</p>
          <div class="mt-5 flex justify-end gap-2"><button type="button" class="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium" @click="deliveryModalOpen = false">Cancelar</button><button :disabled="secondarySaving" class="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{{ secondarySaving ? 'Registrando…' : 'Enviar para validação' }}</button></div>
        </form>
      </div>
    </transition>

    <div v-if="checkItemToDelete" class="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-slate-950/55" @click="checkItemToDelete = null"></div>
      <div class="relative w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
        <h3 class="text-lg font-semibold text-slate-950">Remover etapa?</h3>
        <p class="mt-2 text-sm text-slate-500">A etapa sairá do plano de execução e não poderá ser recuperada.</p>
        <div class="mt-5 flex justify-end gap-2"><button class="rounded-md border border-slate-300 px-3 py-2 text-sm" @click="checkItemToDelete = null">Cancelar</button><button class="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white" @click="deleteChecklistItem">Remover</button></div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useApi } from '@/composables/useApi'
import { formatCalendarDate, formatInstant, toCalendarDateInput } from '@/utils/dates'
import type { Company, ProcessItem, ProcessStatus } from '@/types'

const props = defineProps<{ companies: Company[] }>()
const api = useApi()
const processes = ref<ProcessItem[]>([])
const loading = ref(true)
const saving = ref(false)
const formError = ref('')
const loadError = ref('')
const companyFilter = ref('')
const statusFilter = ref('')
const searchFilter = ref('')
const viewMode = ref<'list' | 'board'>((localStorage.getItem('lambda-process-view') as 'list' | 'board') || 'list')
const editorOpen = ref(false)
const editorTab = ref<'context' | 'planning' | 'execution' | 'activity'>('context')
const emptyEditor = () => ({
  id: null as number | null,
  companyId: '',
  title: '',
  description: '',
  objective: '',
  scope: '',
  acceptanceCriteria: '',
  category: 'automation',
  status: 'requested' as ProcessStatus,
  priority: 'normal',
  impact: 'medium',
  health: 'on_track',
  complexity: '',
  position: null as number | null,
  estimateBusinessDays: null as number | null,
  plannedStart: '',
  dueDate: '',
  progress: 0,
  latestUpdate: '',
  blockedReason: '',
  nextAction: '',
  tagsText: '',
  clientCanComment: true,
  createdAt: '',
  deliveredAt: '',
  updates: [] as NonNullable<ProcessItem['updates']>,
  checklist: [] as NonNullable<ProcessItem['checklist']>,
  deliveries: [] as NonNullable<ProcessItem['deliveries']>
})
const editor = ref(emptyEditor())
const checklistModalOpen = ref(false)
const deliveryModalOpen = ref(false)
const checkItemToDelete = ref<number | null>(null)
const secondarySaving = ref(false)
const secondaryFormError = ref('')
const checklistForm = ref({ title: '', description: '', dueDate: '' })
const deliveryForm = ref({ title: '', version: '', environment: 'production', summary: '', releaseNotes: '', rollbackPlan: '', artifactLinksText: '' })
const statuses: Array<{ value: ProcessStatus; label: string }> = [
  { value: 'requested', label: 'Recebida' },
  { value: 'analysis', label: 'Em análise' },
  { value: 'queued', label: 'Na fila' },
  { value: 'in_progress', label: 'Em desenvolvimento' },
  { value: 'validation', label: 'Em validação' },
  { value: 'delivered', label: 'Entregue' },
  { value: 'paused', label: 'Pausada' },
  { value: 'cancelled', label: 'Cancelada' }
]

const filteredProcesses = computed(() => {
  const search = searchFilter.value.trim().toLocaleLowerCase('pt-BR')
  return processes.value.filter(item =>
    (!companyFilter.value || String(item.companyId) === companyFilter.value) &&
    (
      !statusFilter.value ||
      item.status === statusFilter.value ||
      (statusFilter.value === 'intake' && ['requested', 'analysis'].includes(item.status)) ||
      (statusFilter.value === 'execution' && ['in_progress', 'validation'].includes(item.status))
    ) &&
    (!search || [item.referenceCode, item.title, item.companyName, item.description, item.nextAction, ...(item.tags || [])]
      .some(value => value?.toLocaleLowerCase('pt-BR').includes(search)))
  )
})
const summaries = computed(() => [
  { label: 'Recebidas / análise', value: processes.value.filter(item => ['requested', 'analysis'].includes(item.status)).length, filter: 'analysis' },
  { label: 'Na fila', value: processes.value.filter(item => item.status === 'queued').length, filter: 'queued' },
  { label: 'Em execução', value: processes.value.filter(item => ['in_progress', 'validation'].includes(item.status)).length, filter: 'execution' },
  { label: 'Entregues', value: processes.value.filter(item => item.status === 'delivered').length, filter: 'delivered' }
])
const boardColumns = computed(() => [
  { key: 'intake', label: 'Entrada', items: filteredProcesses.value.filter(item => ['requested', 'analysis'].includes(item.status)) },
  { key: 'queue', label: 'Planejadas', items: filteredProcesses.value.filter(item => ['queued', 'paused'].includes(item.status)) },
  { key: 'execution', label: 'Em execução', items: filteredProcesses.value.filter(item => item.status === 'in_progress') },
  { key: 'validation', label: 'Validação', items: filteredProcesses.value.filter(item => item.status === 'validation') },
  { key: 'done', label: 'Concluídas', items: filteredProcesses.value.filter(item => ['delivered', 'cancelled'].includes(item.status)) }
])
const activeFilters = computed(() => {
  const filters: Array<{ label: string; clear: () => void }> = []
  if (companyFilter.value) {
    const company = props.companies.find(item => String(item.id) === companyFilter.value)
    filters.push({ label: company?.name || 'Empresa', clear: () => { companyFilter.value = '' } })
  }
  if (statusFilter.value) {
    const label = statusFilter.value === 'intake'
      ? 'Recebidas / análise'
      : statusFilter.value === 'execution'
        ? 'Em execução / validação'
        : statusLabel(statusFilter.value as ProcessStatus)
    filters.push({ label, clear: () => { statusFilter.value = '' } })
  }
  if (searchFilter.value) filters.push({ label: `Busca: ${searchFilter.value}`, clear: () => { searchFilter.value = '' } })
  return filters
})
const selectedEditorProcess = computed(() => editor.value.id ? processes.value.find(item => item.id === editor.value.id) || null : null)
const editorTabs = computed(() => [
  { value: 'context' as const, label: 'Contexto', count: null },
  { value: 'planning' as const, label: 'Planejamento', count: null },
  { value: 'execution' as const, label: 'Execução', count: editor.value.checklist.length + editor.value.deliveries.length },
  { value: 'activity' as const, label: 'Atividade', count: editor.value.updates.length }
])

const statusLabel = (status: ProcessStatus) => statuses.find(item => item.value === status)?.label || status
const statusClass = (status: ProcessStatus) => ({
  requested: 'bg-slate-100 text-slate-700',
  analysis: 'bg-amber-100 text-amber-800',
  queued: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-indigo-100 text-indigo-800',
  validation: 'bg-violet-100 text-violet-800',
  delivered: 'bg-emerald-100 text-emerald-800',
  paused: 'bg-orange-100 text-orange-800',
  cancelled: 'bg-red-100 text-red-800'
}[status])
const healthLabel = (health: ProcessItem['health']) => ({ on_track: 'No prazo', at_risk: 'Em risco', off_track: 'Fora do plano', blocked: 'Bloqueado' }[health])
const healthClass = (health: ProcessItem['health']) => ({ on_track: 'bg-emerald-50 text-emerald-700', at_risk: 'bg-amber-100 text-amber-800', off_track: 'bg-red-100 text-red-800', blocked: 'bg-red-100 text-red-800' }[health])
const environmentLabel = (environment: 'development' | 'staging' | 'production') => ({ development: 'Desenvolvimento', staging: 'Homologação', production: 'Produção' }[environment])
const deliveryStatusLabel = (status: 'draft' | 'ready' | 'accepted' | 'rejected') => ({ draft: 'Rascunho', ready: 'Aguardando aceite', accepted: 'Aceita', rejected: 'Ajustes solicitados' }[status])
const deliveryStatusClass = (status: 'draft' | 'ready' | 'accepted' | 'rejected') => ({ draft: 'bg-slate-100 text-slate-700', ready: 'bg-violet-100 text-violet-800', accepted: 'bg-emerald-100 text-emerald-800', rejected: 'bg-amber-100 text-amber-800' }[status])
const formatDate = (date: string) => formatCalendarDate(date)
const formatDateTime = (date: string) => formatInstant(date, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const clearFilters = () => { companyFilter.value = ''; statusFilter.value = ''; searchFilter.value = '' }
const applySummaryFilter = (filter: string) => {
  searchFilter.value = ''
  statusFilter.value = filter === 'analysis' ? 'intake' : filter
}

const fetchProcesses = async () => {
  loading.value = true
  loadError.value = ''
  try {
    processes.value = (await api.get<{ processes: ProcessItem[] }>('/processes')).processes
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Tente novamente em alguns instantes.'
  } finally {
    loading.value = false
  }
}
const openCreate = () => {
  editor.value = emptyEditor()
  editorTab.value = 'context'
  formError.value = ''
  editorOpen.value = true
}
const openEdit = (item: ProcessItem) => {
  editor.value = {
    id: item.id,
    companyId: String(item.companyId),
    title: item.title,
    description: item.description,
    objective: item.objective || '',
    scope: item.scope || '',
    acceptanceCriteria: item.acceptanceCriteria || '',
    category: item.category,
    status: item.status,
    priority: item.priority,
    impact: item.impact || 'medium',
    health: item.health || 'on_track',
    complexity: item.complexity || '',
    position: item.position,
    estimateBusinessDays: item.estimateBusinessDays,
    plannedStart: toCalendarDateInput(item.plannedStart),
    dueDate: toCalendarDateInput(item.dueDate),
    progress: item.progress,
    latestUpdate: '',
    blockedReason: item.blockedReason || '',
    nextAction: item.nextAction || '',
    tagsText: (item.tags || []).join(', '),
    clientCanComment: item.clientCanComment !== false,
    createdAt: toCalendarDateInput(item.createdAt),
    deliveredAt: toCalendarDateInput(item.deliveredAt),
    updates: item.updates || [],
    checklist: item.checklist || [],
    deliveries: item.deliveries || []
  }
  editorTab.value = 'context'
  formError.value = ''
  editorOpen.value = true
}
const closeEditor = () => { editorOpen.value = false; formError.value = '' }
const saveProcess = async () => {
  formError.value = ''
  if (editor.value.plannedStart && editor.value.dueDate && editor.value.dueDate < editor.value.plannedStart) {
    formError.value = 'A previsão de entrega não pode ser anterior ao início planejado'
    editorTab.value = 'planning'
    return
  }
  saving.value = true
  const payload: Record<string, unknown> = {
    companyId: Number(editor.value.companyId),
    title: editor.value.title,
    description: editor.value.description,
    objective: editor.value.objective || null,
    scope: editor.value.scope || null,
    acceptanceCriteria: editor.value.acceptanceCriteria || null,
    category: editor.value.category,
    status: editor.value.status,
    priority: editor.value.priority,
    impact: editor.value.impact,
    health: editor.value.health,
    complexity: editor.value.complexity || null,
    position: editor.value.status === 'queued' ? (editor.value.position || undefined) : null,
    estimateBusinessDays: editor.value.estimateBusinessDays || null,
    createdAt: editor.value.createdAt || undefined,
    plannedStart: editor.value.plannedStart || null,
    dueDate: editor.value.dueDate || null,
    deliveredAt: editor.value.deliveredAt || undefined,
    progress: editor.value.progress,
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
    formError.value = error instanceof Error ? error.message : 'Não foi possível salvar o processo'
  } finally {
    saving.value = false
  }
}
const refreshOpenEditor = async () => {
  const processId = editor.value.id
  const activeTab = editorTab.value
  await fetchProcesses()
  if (processId) {
    const updated = processes.value.find(item => item.id === processId)
    if (updated) {
      openEdit(updated)
      editorTab.value = activeTab
    }
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
    await api.post(`/processes/${editor.value.id}/checklist`, { title: checklistForm.value.title, description: checklistForm.value.description || null, dueDate: checklistForm.value.dueDate || null })
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
  void updateChecklistStatus(itemId, (event.target as HTMLSelectElement).value)
}
const deleteChecklistItem = async () => {
  if (!editor.value.id || !checkItemToDelete.value) return
  try {
    await api.del(`/processes/${editor.value.id}/checklist/${checkItemToDelete.value}`)
    checkItemToDelete.value = null
    await refreshOpenEditor()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Não foi possível remover a etapa'
  }
}
const openDeliveryModal = () => {
  deliveryForm.value = { title: '', version: '', environment: 'production', summary: '', releaseNotes: '', rollbackPlan: '', artifactLinksText: '' }
  secondaryFormError.value = ''
  deliveryModalOpen.value = true
}
const createDelivery = async () => {
  if (!editor.value.id) return
  secondarySaving.value = true
  secondaryFormError.value = ''
  try {
    const artifactLinks = deliveryForm.value.artifactLinksText.split(/\r?\n/).map(link => link.trim()).filter(Boolean)
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

watch(viewMode, value => localStorage.setItem('lambda-process-view', value))
onMounted(fetchProcesses)
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active { transition: opacity .18s ease; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }
</style>
