<template>
  <section class="mapping-workspace">
    <div class="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
      <label class="min-w-0 flex-1">
        <span class="mb-1.5 block text-xs font-medium text-slate-500">Documento ativo</span>
        <select v-model="selectedSetId" class="min-h-11 w-full max-w-2xl rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900">
          <option value="">Selecione um de-para</option>
          <option v-for="mappingSet in mappingSets" :key="mappingSet.id" :value="String(mappingSet.id)">
            {{ mappingSet.name }} · {{ mappingSet.sourceSystem }} → {{ mappingSet.targetSystem }} · v{{ mappingSet.version }} · {{ setStatusLabel(mappingSet.status) }}
          </option>
        </select>
      </label>
      <div class="flex flex-wrap gap-2">
        <button v-if="selectedSet" class="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50" @click="exportMarkdown">
          Exportar .md
        </button>
        <button v-if="selectedSet" class="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50" @click="exportCsv">
          Exportar CSV
        </button>
        <button v-if="auth.isAdmin" class="min-h-10 rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800" @click="openCreateModal">
          Novo de-para
        </button>
      </div>
    </div>

    <div v-if="loading" class="flex min-h-64 items-center justify-center text-sm text-slate-500" aria-live="polite">
      Carregando mapeamentos…
    </div>
    <div v-else-if="errorMessage" class="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <div class="flex items-center justify-between gap-3">
        <span>{{ errorMessage }}</span>
        <button class="font-medium underline underline-offset-2" @click="fetchMappings()">Tentar novamente</button>
      </div>
    </div>
    <div v-else-if="!mappingSets.length" class="mt-5 rounded-lg border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <h3 class="font-semibold text-slate-900">Nenhum de-para disponível</h3>
      <p class="mx-auto mt-1 max-w-lg text-sm leading-6 text-slate-500">
        {{ auth.isAdmin ? 'Crie um documento do zero ou importe um arquivo pronto para manter decisões, regras e campos em uma única fonte da verdade.' : 'A equipe ainda não publicou o mapeamento desta automação.' }}
      </p>
      <button v-if="auth.isAdmin" class="mt-4 rounded-md bg-slate-950 px-4 py-2.5 text-sm font-medium text-white" @click="openCreateModal">
        Criar ou importar
      </button>
    </div>

    <template v-else-if="selectedSet">
      <header class="py-5">
        <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-lg font-semibold tracking-tight text-slate-950">{{ selectedSet.name }}</h3>
              <span :class="setStatusClass(selectedSet.status)" class="rounded-full px-2 py-0.5 text-xs font-medium">{{ setStatusLabel(selectedSet.status) }}</span>
              <span class="text-xs text-slate-400">versão {{ selectedSet.version }} · revisão {{ selectedSet.revision }}</span>
              <span v-if="selectedSet.hasUnreviewedClientChanges" class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                Alterações aguardando revisão
              </span>
            </div>
            <p class="mt-1 text-sm text-slate-500">
              <span class="font-medium text-slate-700">{{ selectedSet.sourceSystem }}</span>
              <span class="mx-1.5" aria-hidden="true">→</span>
              <span class="font-medium text-slate-700">{{ selectedSet.targetSystem }}</span>
              <span v-if="selectedSet.description"> · {{ selectedSet.description }}</span>
            </p>
            <p v-if="selectedSet.processTitle" class="mt-1 text-xs text-slate-400">Processo relacionado: {{ selectedSet.processTitle }}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button v-if="auth.isAdmin" class="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50" @click="openMetadataModal">
              Configurações
            </button>
            <button v-if="auth.isAdmin && selectedSet.status !== 'draft'" class="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50" @click="cloneSet">
              Criar nova versão
            </button>
            <button v-if="canEditDocument" class="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50" @click="openDocumentEditor">
              Editar documento
            </button>
            <button v-if="auth.isAdmin && selectedSet.status === 'draft'" class="rounded-md bg-slate-950 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800" @click="publishConfirmOpen = true">
              Publicar para o cliente
            </button>
            <button v-if="auth.isAdmin && selectedSet.status !== 'archived'" class="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50" @click="archiveConfirmOpen = true">
              Arquivar
            </button>
            <button v-if="auth.isAdmin && selectedSet.status !== 'published'" class="rounded-md px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50" @click="deleteSetConfirmOpen = true">
              Excluir
            </button>
          </div>
        </div>

        <dl class="mt-5 grid gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-4">
          <div class="bg-white px-4 py-3">
            <dt class="text-xs text-slate-500">Vínculos estruturados</dt>
            <dd class="mt-1 text-xl font-semibold text-slate-950">{{ selectedSet.entries.length }}</dd>
          </div>
          <div class="bg-white px-4 py-3">
            <dt class="text-xs text-slate-500">Pendências</dt>
            <dd class="mt-1 text-xl font-semibold" :class="pendingCount ? 'text-amber-700' : 'text-slate-950'">{{ pendingCount }}</dd>
          </div>
          <div class="bg-white px-4 py-3">
            <dt class="text-xs text-slate-500">Arquivos anexados</dt>
            <dd class="mt-1 text-xl font-semibold text-slate-950">{{ selectedSet.attachments?.length || 0 }}</dd>
          </div>
          <div class="bg-white px-4 py-3">
            <dt class="text-xs text-slate-500">{{ selectedSet.clientEditMode === 'none' ? 'Última alteração' : 'Colaboração do cliente' }}</dt>
            <dd class="mt-1 text-sm font-medium text-slate-800">
              {{ selectedSet.hasUnreviewedClientChanges ? 'Revisão pendente' : selectedSet.clientEditMode === 'none' ? formatDate(selectedSet.closedAt || selectedSet.updatedAt) : clientEditModeLabel(selectedSet.clientEditMode) }}
            </dd>
          </div>
        </dl>
      </header>

      <nav class="flex gap-5 overflow-x-auto border-b border-slate-200" aria-label="Conteúdo do de-para">
        <button
          v-for="tab in workspaceTabs"
          :key="tab.value"
          class="whitespace-nowrap border-b-2 px-0.5 pb-3 text-sm font-medium transition-colors"
          :class="activeTab === tab.value ? 'border-slate-950 text-slate-950' : 'border-transparent text-slate-500 hover:text-slate-800'"
          @click="activeTab = tab.value"
        >
          {{ tab.label }}
          <span v-if="tab.count !== null" class="ml-1 text-xs text-slate-400">{{ tab.count }}</span>
        </button>
      </nav>

      <section v-if="activeTab === 'document'" class="pt-5">
        <div v-if="!auth.isAdmin && clientNextAction" class="mb-4 flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
          <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-semibold text-white">1</span>
          <div>
            <p class="text-sm font-semibold text-slate-900">{{ clientNextAction.title }}</p>
            <p class="mt-0.5 text-xs leading-5 text-slate-600">{{ clientNextAction.detail }}</p>
          </div>
        </div>
        <div v-if="selectedSet.clientInstructions && !auth.isAdmin" class="mb-4 rounded-md border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm leading-6 text-indigo-900">
          <span class="font-medium">Orientação da equipe:</span> {{ selectedSet.clientInstructions }}
        </div>
        <div v-if="selectedSet.status === 'published' && selectedSet.clientEditMode === 'none'" class="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Versão publicada e protegida contra alterações. Para editar como administrador, crie uma nova versão.
        </div>
        <div v-else-if="selectedSet.status === 'published' && selectedSet.clientEditMode !== 'none'" class="mb-5 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {{ selectedSet.clientEditMode === 'all' ? 'Este de-para está aberto para preenchimento completo pelo cliente.' : 'Somente os campos marcados pela equipe podem ser preenchidos pelo cliente.' }}
        </div>
        <div v-if="selectedSet.contentMarkdown" class="mapping-document rounded-lg border border-slate-200 bg-white px-5 py-6 sm:px-8 sm:py-8" v-html="renderedDocument"></div>
        <div v-else class="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <h4 class="font-semibold text-slate-900">O documento ainda está vazio</h4>
          <p class="mx-auto mt-1 max-w-lg text-sm leading-6 text-slate-500">Registre tabelas, perguntas, decisões, regras e pré-requisitos com total liberdade usando Markdown.</p>
          <button v-if="canEditDocument" class="mt-4 rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white" @click="openDocumentEditor">
            Começar documento
          </button>
        </div>
      </section>

      <section v-else-if="activeTab === 'fields'" class="pt-5">
        <div v-if="selectedEntryIds.length" class="mb-4 flex flex-col gap-3 rounded-md border border-slate-300 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p class="text-sm font-medium text-slate-800">{{ selectedEntryIds.length }} vínculo{{ selectedEntryIds.length === 1 ? '' : 's' }} selecionado{{ selectedEntryIds.length === 1 ? '' : 's' }}</p>
          <div class="flex flex-wrap gap-2">
            <select v-model="bulkStatus" class="min-h-9 rounded-md border border-slate-300 bg-white px-3 text-xs">
              <option value="">Alterar situação…</option>
              <option value="mapped">Mapeado</option>
              <option value="pending">Pendente</option>
              <option value="attention">Requer atenção</option>
              <option value="ignored">Desconsiderado</option>
            </select>
            <button :disabled="!bulkStatus || saving" class="rounded-md bg-slate-950 px-3 py-2 text-xs font-medium text-white disabled:opacity-40" @click="applyBulkStatus">
              Aplicar
            </button>
            <button class="rounded-md px-3 py-2 text-xs font-medium text-slate-600 hover:bg-white" @click="selectedEntryIds = []">Limpar seleção</button>
          </div>
        </div>
        <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div class="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row">
            <label class="min-w-0 flex-1">
              <span class="mb-1 block text-xs font-medium text-slate-500">Buscar</span>
              <input v-model="entrySearch" type="search" placeholder="Origem, destino, seção, regra ou observação" class="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900" />
            </label>
            <label>
              <span class="mb-1 block text-xs font-medium text-slate-500">Situação</span>
              <select v-model="entryStatusFilter" class="min-h-10 min-w-44 rounded-md border border-slate-300 bg-white px-3 text-sm">
                <option value="">Todas</option>
                <option value="mapped">Mapeado</option>
                <option value="pending">Pendente</option>
                <option value="attention">Requer atenção</option>
                <option value="ignored">Desconsiderado</option>
              </select>
            </label>
          </div>
          <button v-if="canAddEntry" class="min-h-10 rounded-md bg-slate-950 px-3 text-sm font-medium text-white" @click="openEntryModal()">
            Adicionar vínculo
          </button>
        </div>

        <div class="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table class="w-full min-w-[980px] text-left">
            <thead class="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
              <tr>
                <th v-if="auth.isAdmin && selectedSet.status === 'draft'" class="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-slate-300"
                    :checked="allVisibleEntriesSelected"
                    :aria-label="allVisibleEntriesSelected ? 'Desmarcar vínculos visíveis' : 'Selecionar vínculos visíveis'"
                    @change="toggleVisibleEntries"
                  >
                </th>
                <th class="px-4 py-3">Origem</th>
                <th class="px-4 py-3">Destino</th>
                <th class="px-4 py-3">Regra</th>
                <th class="px-4 py-3">Situação</th>
                <th class="px-4 py-3">Observações</th>
                <th v-if="showsEntryActions" class="w-36 px-4 py-3"><span class="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-sm">
              <tr v-for="entry in paginatedEntries" :key="entry.id" class="align-top hover:bg-slate-50/70">
                <td v-if="auth.isAdmin && selectedSet.status === 'draft'" class="px-3 py-3">
                  <input v-model="selectedEntryIds" type="checkbox" :value="entry.id" class="h-4 w-4 rounded border-slate-300" :aria-label="`Selecionar ${entry.sourcePath}`">
                </td>
                <td class="px-4 py-3">
                  <p v-if="entry.section" class="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">{{ entry.section }}</p>
                  <code class="font-mono text-xs text-slate-900">{{ entry.sourcePath }}</code>
                  <p v-if="entry.sourceType" class="mt-1 text-xs text-slate-400">{{ entry.sourceType }}</p>
                </td>
                <td class="px-4 py-3">
                  <code class="font-mono text-xs text-slate-900">{{ entry.targetPath }}</code>
                  <p v-if="entry.targetType" class="mt-1 text-xs text-slate-400">{{ entry.targetType }}</p>
                </td>
                <td class="px-4 py-3">
                  <p class="max-w-xs whitespace-pre-wrap text-xs leading-5 text-slate-600">{{ entry.transformation || 'Cópia direta' }}</p>
                  <p v-if="entry.fallbackValue" class="mt-1 text-xs text-slate-400">Fallback: {{ entry.fallbackValue }}</p>
                  <p v-if="entry.isRequired" class="mt-1 text-xs font-medium text-red-700">Obrigatório</p>
                </td>
                <td class="px-4 py-3">
                  <span :class="entryStatusClass(entry.mappingStatus)" class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium">{{ entryStatusLabel(entry.mappingStatus) }}</span>
                </td>
                <td class="px-4 py-3"><p class="max-w-xs whitespace-pre-wrap text-xs leading-5 text-slate-500">{{ entry.notes || '—' }}</p></td>
                <td v-if="showsEntryActions" class="px-4 py-3">
                  <div class="flex items-center justify-end gap-2">
                    <button v-if="canEditEntry(entry)" class="text-xs font-medium text-slate-700 hover:text-slate-950" @click="openEntryModal(entry)">Editar</button>
                    <button v-if="canDeleteEntry" class="text-xs font-medium text-red-600 hover:text-red-700" @click="entryToDelete = entry">Excluir</button>
                  </div>
                </td>
              </tr>
              <tr v-if="!filteredEntries.length">
                <td :colspan="(showsEntryActions ? 6 : 5) + (auth.isAdmin && selectedSet.status === 'draft' ? 1 : 0)" class="px-5 py-12 text-center">
                  <p class="text-sm font-medium text-slate-700">{{ selectedSet.entries.length ? 'Nenhum vínculo corresponde aos filtros.' : 'Nenhum vínculo estruturado.' }}</p>
                  <p v-if="!selectedSet.entries.length" class="mt-1 text-xs text-slate-500">Use esta visão quando precisar filtrar, exportar ou validar campos individualmente.</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="filteredEntries.length > entryPageSize" class="flex items-center justify-between border-x border-b border-slate-200 bg-white px-4 py-3">
          <p class="text-xs text-slate-500">
            {{ (entryPage - 1) * entryPageSize + 1 }}–{{ Math.min(entryPage * entryPageSize, filteredEntries.length) }} de {{ filteredEntries.length }}
          </p>
          <div class="flex gap-2">
            <button :disabled="entryPage === 1" class="rounded-md border border-slate-300 px-3 py-2 text-xs disabled:opacity-40" @click="entryPage -= 1">Anterior</button>
            <button :disabled="entryPage >= entryPageCount" class="rounded-md border border-slate-300 px-3 py-2 text-xs disabled:opacity-40" @click="entryPage += 1">Próxima</button>
          </div>
        </div>
      </section>

      <section v-else-if="activeTab === 'history'" class="pt-5">
        <MappingHistoryPanel :mapping-set="selectedSet" @changed="handleHistoryChanged" />
      </section>

      <section v-else-if="activeTab === 'files'" class="pt-5">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h4 class="font-semibold text-slate-900">Arquivos de referência</h4>
            <p class="mt-1 text-sm text-slate-500">Originais importados e materiais usados para construir este de-para.</p>
          </div>
          <button v-if="auth.isAdmin && selectedSet.status === 'draft'" class="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white" @click="attachmentModalOpen = true">
            Anexar arquivo
          </button>
        </div>
        <div v-if="selectedSet.attachments?.length" class="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <article v-for="attachment in selectedSet.attachments" :key="attachment.id" class="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-slate-900">{{ attachment.fileName }}</p>
              <p class="mt-1 text-xs text-slate-500">{{ formatFileSize(attachment.fileSize) }} · {{ formatDate(attachment.createdAt) }}<span v-if="attachment.hasExtractedText"> · texto importável</span></p>
            </div>
            <div class="flex shrink-0 gap-2">
              <button class="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50" @click="downloadAttachment(attachment.id, attachment.fileName)">Baixar</button>
              <button v-if="auth.isAdmin && selectedSet.status === 'draft'" class="rounded-md px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50" @click="attachmentToDelete = attachment">Remover</button>
            </div>
          </article>
        </div>
        <div v-else class="mt-5 rounded-lg border border-dashed border-slate-300 px-6 py-12 text-center text-sm text-slate-500">
          Nenhum arquivo anexado a esta versão.
        </div>
      </section>

      <section v-else class="pt-5">
        <div class="grid gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-4">
          <div class="bg-white px-4 py-3">
            <p class="text-xs text-slate-500">Cobertura do de-para</p>
            <p class="mt-1 text-xl font-semibold text-slate-950">{{ mappingQuality.completionPercent }}%</p>
          </div>
          <div class="bg-white px-4 py-3">
            <p class="text-xs text-slate-500">Mapeados</p>
            <p class="mt-1 text-xl font-semibold text-emerald-700">{{ mappingQuality.mapped }}</p>
          </div>
          <div class="bg-white px-4 py-3">
            <p class="text-xs text-slate-500">Exigem decisão</p>
            <p class="mt-1 text-xl font-semibold" :class="mappingQuality.unresolved ? 'text-amber-700' : 'text-slate-950'">{{ mappingQuality.unresolved }}</p>
          </div>
          <div class="bg-white px-4 py-3">
            <p class="text-xs text-slate-500">Possíveis duplicidades</p>
            <p class="mt-1 text-xl font-semibold" :class="mappingQuality.duplicates.length ? 'text-red-700' : 'text-slate-950'">{{ mappingQuality.duplicates.length }}</p>
          </div>
        </div>

        <div class="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div class="rounded-lg border border-slate-200 bg-white">
            <header class="border-b border-slate-200 px-4 py-3">
              <h4 class="text-sm font-semibold text-slate-900">Checklist de publicação</h4>
            </header>
            <ul class="divide-y divide-slate-100">
              <li v-for="check in mappingQuality.checks" :key="check.label" class="flex items-start gap-3 px-4 py-3">
                <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold" :class="check.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'">
                  {{ check.ok ? '✓' : '!' }}
                </span>
                <span>
                  <span class="block text-sm font-medium text-slate-800">{{ check.label }}</span>
                  <span class="mt-0.5 block text-xs leading-5 text-slate-500">{{ check.detail }}</span>
                </span>
              </li>
            </ul>
          </div>
          <aside class="rounded-lg border border-slate-200 bg-white p-4">
            <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Prontidão</p>
            <p class="mt-2 text-lg font-semibold" :class="mappingQuality.ready ? 'text-emerald-700' : 'text-amber-800'">
              {{ mappingQuality.ready ? 'Pronto para publicar' : 'Revisão recomendada' }}
            </p>
            <p class="mt-2 text-xs leading-5 text-slate-500">
              {{ mappingQuality.ready ? 'O conteúdo atende à política de publicação configurada.' : 'Resolva os itens exigidos pela política antes de publicar.' }}
            </p>
            <button v-if="auth.isAdmin && selectedSet.status === 'draft'" type="button" class="mt-4 w-full rounded-md bg-slate-950 px-3 py-2 text-xs font-medium text-white" @click="publishConfirmOpen = true">
              Revisar publicação
            </button>
          </aside>
        </div>

        <div v-if="mappingQuality.duplicates.length" class="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-4">
          <h4 class="text-sm font-semibold text-red-900">Origens repetidas</h4>
          <p class="mt-1 text-xs leading-5 text-red-700">Confirme se a mesma origem realmente deve alimentar mais de um destino.</p>
          <ul class="mt-3 space-y-1.5 text-xs text-red-800">
            <li v-for="duplicate in mappingQuality.duplicates" :key="duplicate.key">
              <code>{{ duplicate.sourcePath }}</code> aparece em {{ duplicate.count }} vínculos
            </li>
          </ul>
        </div>
      </section>
    </template>

    <div v-if="createModalOpen" class="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-slate-950/55" @click="closeCreateModal"></div>
      <form class="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl" @submit.prevent="createSet">
        <header class="border-b border-slate-200 px-6 py-5">
          <h3 class="text-lg font-semibold text-slate-950">Novo de-para</h3>
          <p class="mt-1 text-sm text-slate-500">Comece com uma estrutura inteligente ou aproveite um documento pronto.</p>
        </header>
        <div class="p-6">
          <div class="grid grid-cols-2 gap-1 rounded-md bg-slate-100 p-1">
            <button type="button" class="rounded px-3 py-2 text-sm font-medium" :class="createMode === 'template' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'" @click="createMode = 'template'">Criar do zero</button>
            <button type="button" class="rounded px-3 py-2 text-sm font-medium" :class="createMode === 'import' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'" @click="createMode = 'import'">Importar arquivo</button>
          </div>

          <label v-if="createMode === 'import'" class="mt-5 block rounded-lg border border-dashed border-slate-300 px-5 py-7 text-center hover:border-slate-400">
            <input ref="createFileInput" class="sr-only" type="file" accept=".md,.markdown,.txt,.pdf,.csv,.tsv,.json,.html,.htm,.xml,.yaml,.yml,.doc,.docx,.odt,.xls,.xlsx,.ods,.png,.jpg,.jpeg,.webp" @change="selectCreateFile">
            <span class="block text-sm font-medium text-slate-800">{{ createFile?.name || 'Escolher um arquivo' }}</span>
            <span class="mt-1 block text-xs text-slate-500">Documentos, planilhas, imagens, PDF, MD, TXT, CSV ou JSON · até 10 MB</span>
          </label>

          <div class="mt-5 space-y-4">
            <div>
              <label class="mb-1.5 block text-sm font-medium text-slate-700">Nome do de-para</label>
              <input v-model="setForm.name" required maxlength="160" placeholder="Ex.: Contas a pagar e a receber" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900">
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="mb-1.5 block text-sm font-medium text-slate-700">Sistema de origem</label>
                <input v-model="setForm.sourceSystem" required maxlength="160" placeholder="Ex.: Bling" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900">
              </div>
              <div>
                <label class="mb-1.5 block text-sm font-medium text-slate-700">Sistema de destino</label>
                <input v-model="setForm.targetSystem" required maxlength="160" placeholder="Ex.: Omie" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900">
              </div>
            </div>
            <div v-if="props.processOptions?.length">
              <label class="mb-1.5 block text-sm font-medium text-slate-700">Processo relacionado <span class="font-normal text-slate-400">(opcional)</span></label>
              <select v-model="setForm.processId" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm">
                <option value="">Sem vínculo com processo</option>
                <option v-for="process in props.processOptions" :key="process.id" :value="String(process.id)">
                  {{ process.referenceCode }} · {{ process.title }}
                </option>
              </select>
              <p class="mt-1 text-xs text-slate-500">O de-para ficará acessível dentro do contexto desta demanda.</p>
            </div>
            <div v-if="createMode === 'template'">
              <label class="mb-1.5 block text-sm font-medium text-slate-700">Estrutura inicial</label>
              <select v-model="setForm.template" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm">
                <option value="complete">De-para completo</option>
                <option value="migration">Migração de dados</option>
                <option value="empty">Documento vazio</option>
              </select>
            </div>
            <div>
              <label class="mb-1.5 block text-sm font-medium text-slate-700">Descrição curta <span class="font-normal text-slate-400">(opcional)</span></label>
              <textarea v-model="setForm.description" rows="2" maxlength="3000" class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm"></textarea>
            </div>
          </div>
          <p v-if="modalError" class="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{{ modalError }}</p>
        </div>
        <footer class="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button type="button" class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium" @click="closeCreateModal">Cancelar</button>
          <button :disabled="saving || (createMode === 'import' && !createFile)" class="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{{ saving ? 'Criando…' : createMode === 'import' ? 'Importar de-para' : 'Criar de-para' }}</button>
        </footer>
      </form>
    </div>

    <div v-if="documentEditorOpen && selectedSet" class="fixed inset-0 z-[70]">
      <div class="absolute inset-0 bg-slate-950/45" @click="closeDocumentEditor()"></div>
      <aside class="absolute inset-y-0 right-0 flex w-full max-w-5xl flex-col border-l border-slate-200 bg-white shadow-xl">
        <header class="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 class="font-semibold text-slate-950">Editar documento</h3>
            <p class="mt-0.5 text-xs text-slate-500">Markdown · {{ documentDraft.length.toLocaleString('pt-BR') }} caracteres</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium" @click="closeDocumentEditor()">Cancelar</button>
            <button :disabled="saving" type="button" class="rounded-md bg-slate-950 px-3 py-2 text-xs font-medium text-white disabled:opacity-50" @click="saveDocument">{{ saving ? 'Salvando…' : 'Salvar documento' }}</button>
          </div>
        </header>
        <div class="flex flex-wrap gap-1 border-b border-slate-200 px-4 py-2">
          <button v-for="snippet in editorSnippets" :key="snippet.label" type="button" class="rounded px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900" @click="insertSnippet(snippet.content)">
            {{ snippet.label }}
          </button>
        </div>
        <div class="grid min-h-0 flex-1 lg:grid-cols-2">
          <div class="flex min-h-0 flex-col border-r border-slate-200">
            <p class="border-b border-slate-100 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-400">Conteúdo</p>
            <textarea ref="documentTextarea" v-model="documentDraft" class="min-h-[45vh] flex-1 resize-none border-0 p-5 font-mono text-sm leading-6 outline-none" spellcheck="true"></textarea>
          </div>
          <div class="min-h-0 overflow-y-auto bg-slate-50">
            <p class="sticky top-0 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-400">Pré-visualização</p>
            <div v-if="documentDraft.trim()" class="mapping-document m-4 rounded-lg border border-slate-200 bg-white p-6" v-html="renderMappingMarkdown(documentDraft)"></div>
            <p v-else class="p-10 text-center text-sm text-slate-500">Comece a escrever para visualizar o documento.</p>
          </div>
        </div>
        <p v-if="modalError" class="border-t border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{{ modalError }}</p>
      </aside>
    </div>

    <div v-if="metadataModalOpen && selectedSet" class="fixed inset-0 z-[75] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-slate-950/55" @click="metadataModalOpen = false"></div>
      <form class="relative w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-xl" @submit.prevent="saveMetadata">
        <h3 class="text-lg font-semibold text-slate-950">Configurações do de-para</h3>
        <div class="mt-5 space-y-4">
          <div><label class="mb-1.5 block text-sm font-medium">Nome</label><input v-model="metadataForm.name" required maxlength="160" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm"></div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div><label class="mb-1.5 block text-sm font-medium">Origem</label><input v-model="metadataForm.sourceSystem" required maxlength="160" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm"></div>
            <div><label class="mb-1.5 block text-sm font-medium">Destino</label><input v-model="metadataForm.targetSystem" required maxlength="160" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm"></div>
          </div>
          <div><label class="mb-1.5 block text-sm font-medium">Descrição</label><textarea v-model="metadataForm.description" rows="3" maxlength="3000" class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm"></textarea></div>
          <div v-if="props.processOptions?.length">
            <label class="mb-1.5 block text-sm font-medium">Processo relacionado</label>
            <select v-model="metadataForm.processId" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm">
              <option value="">Sem vínculo com processo</option>
              <option v-for="process in props.processOptions" :key="process.id" :value="String(process.id)">
                {{ process.referenceCode }} · {{ process.title }}
              </option>
            </select>
          </div>
          <div class="border-t border-slate-200 pt-4">
            <label class="mb-1.5 block text-sm font-medium">Edição pelo cliente</label>
            <select v-model="metadataForm.clientEditMode" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm">
              <option value="none">Somente visualização</option>
              <option value="all">De-para inteiro editável</option>
              <option value="selected">Somente campos selecionados</option>
            </select>
            <p class="mt-1 text-xs leading-5 text-slate-500">No modo seletivo, escolha os campos permitidos dentro de cada vínculo.</p>
          </div>
          <div v-if="metadataForm.clientEditMode === 'all'" class="grid gap-2 sm:grid-cols-2">
            <label class="flex items-start gap-2 rounded-md border border-slate-200 px-3 py-3 text-sm"><input v-model="metadataForm.clientCanAddEntries" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-slate-300"><span><span class="block font-medium">Adicionar vínculos</span><span class="mt-0.5 block text-xs text-slate-500">Permite criar novas linhas.</span></span></label>
            <label class="flex items-start gap-2 rounded-md border border-slate-200 px-3 py-3 text-sm"><input v-model="metadataForm.clientCanDeleteEntries" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-slate-300"><span><span class="block font-medium">Excluir vínculos</span><span class="mt-0.5 block text-xs text-slate-500">Permite remover linhas.</span></span></label>
          </div>
          <fieldset class="border-t border-slate-200 pt-4">
            <legend class="text-sm font-medium text-slate-800">Política de publicação</legend>
            <p class="mt-1 text-xs leading-5 text-slate-500">Escolha quais verificações realmente devem impedir uma publicação.</p>
            <div class="mt-3 grid gap-2 sm:grid-cols-2">
              <label class="flex items-start gap-2 rounded-md border border-slate-200 px-3 py-3 text-sm">
                <input v-model="metadataForm.validationRules.requireStructuredEntries" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-slate-300">
                <span><span class="block font-medium">Exigir vínculos</span><span class="mt-0.5 block text-xs text-slate-500">Bloqueia documento sem campos estruturados.</span></span>
              </label>
              <label class="flex items-start gap-2 rounded-md border border-slate-200 px-3 py-3 text-sm">
                <input v-model="metadataForm.validationRules.blockUnresolved" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-slate-300">
                <span><span class="block font-medium">Bloquear pendências</span><span class="mt-0.5 block text-xs text-slate-500">Exige resolver itens pendentes ou com atenção.</span></span>
              </label>
              <label class="flex items-start gap-2 rounded-md border border-slate-200 px-3 py-3 text-sm">
                <input v-model="metadataForm.validationRules.blockDuplicateSources" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-slate-300">
                <span><span class="block font-medium">Bloquear duplicidades</span><span class="mt-0.5 block text-xs text-slate-500">Exige revisar origens repetidas na mesma seção.</span></span>
              </label>
              <label class="flex items-start gap-2 rounded-md border border-slate-200 px-3 py-3 text-sm">
                <input v-model="metadataForm.validationRules.requireTypes" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-slate-300">
                <span><span class="block font-medium">Exigir tipos técnicos</span><span class="mt-0.5 block text-xs text-slate-500">Exige tipo de origem e destino em todos os vínculos.</span></span>
              </label>
            </div>
          </fieldset>
          <div><label class="mb-1.5 block text-sm font-medium">Orientações ao cliente</label><textarea v-model="metadataForm.clientInstructions" rows="3" maxlength="5000" placeholder="Explique o que deve ser preenchido e como validar." class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm"></textarea></div>
        </div>
        <p v-if="modalError" class="mt-3 text-sm text-red-700">{{ modalError }}</p>
        <div class="mt-5 flex justify-end gap-2"><button type="button" class="rounded-md border border-slate-300 px-3 py-2 text-sm" @click="metadataModalOpen = false">Cancelar</button><button :disabled="saving" class="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{{ saving ? 'Salvando…' : 'Salvar' }}</button></div>
      </form>
    </div>

    <div v-if="entryModalOpen && selectedSet" class="fixed inset-0 z-[75] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-slate-950/55" @click="entryModalOpen = false"></div>
      <form class="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl" @submit.prevent="saveEntry">
        <header class="border-b border-slate-200 px-6 py-5">
          <h3 class="text-lg font-semibold text-slate-950">{{ entryForm.id ? 'Editar vínculo' : 'Adicionar vínculo' }}</h3>
          <p class="mt-1 text-sm text-slate-500">Documente o valor, a regra e o que ainda depende de decisão.</p>
        </header>
        <div class="grid gap-4 p-6 sm:grid-cols-2">
          <div class="sm:col-span-2"><label class="mb-1.5 block text-sm font-medium">Seção</label><input v-model="entryForm.section" :disabled="!canEditField('section')" maxlength="240" placeholder="Ex.: Condições de pagamento" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"></div>
          <div><label class="mb-1.5 block text-sm font-medium">Valor ou campo de origem</label><input v-model="entryForm.sourcePath" :disabled="!canEditField('sourcePath')" required maxlength="500" placeholder="Ex.: 28 dias" class="w-full rounded-md border border-slate-300 px-3 py-2.5 font-mono text-sm disabled:bg-slate-50 disabled:text-slate-400"></div>
          <div><label class="mb-1.5 block text-sm font-medium">Valor ou campo de destino</label><input v-model="entryForm.targetPath" :disabled="!canEditField('targetPath')" required maxlength="500" placeholder="Ex.: A28 - Para 28 dias" class="w-full rounded-md border border-slate-300 px-3 py-2.5 font-mono text-sm disabled:bg-slate-50 disabled:text-slate-400"></div>
          <div><label class="mb-1.5 block text-sm font-medium">Tipo de origem <span class="font-normal text-slate-400">(opcional)</span></label><input v-model="entryForm.sourceType" :disabled="!canEditField('sourceType')" maxlength="80" placeholder="string" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"></div>
          <div><label class="mb-1.5 block text-sm font-medium">Tipo de destino <span class="font-normal text-slate-400">(opcional)</span></label><input v-model="entryForm.targetType" :disabled="!canEditField('targetType')" maxlength="80" placeholder="string" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"></div>
          <div><label class="mb-1.5 block text-sm font-medium">Situação</label><select v-model="entryForm.mappingStatus" :disabled="!canEditField('mappingStatus')" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"><option value="mapped">Mapeado</option><option value="pending">Pendente</option><option value="attention">Requer atenção</option><option value="ignored">Desconsiderado</option></select></div>
          <div><label class="mb-1.5 block text-sm font-medium">Direção</label><select v-model="entryForm.direction" :disabled="!canEditField('direction')" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"><option value="source_to_target">Origem → destino</option><option value="target_to_source">Destino → origem</option><option value="bidirectional">Bidirecional</option></select></div>
          <div class="sm:col-span-2"><label class="mb-1.5 block text-sm font-medium">Regra ou transformação</label><textarea v-model="entryForm.transformation" :disabled="!canEditField('transformation')" rows="3" maxlength="5000" placeholder="Ex.: remover pontuação e completar com zeros à esquerda." class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"></textarea></div>
          <div><label class="mb-1.5 block text-sm font-medium">Valor padrão (fallback)</label><input v-model="entryForm.fallbackValue" :disabled="!canEditField('fallbackValue')" maxlength="2000" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"></div>
          <label class="flex items-center gap-2 self-end rounded-md border border-slate-200 px-3 py-2.5 text-sm font-medium"><input v-model="entryForm.isRequired" :disabled="!canEditField('isRequired')" type="checkbox" class="h-4 w-4 rounded border-slate-300"> Campo obrigatório</label>
          <div><label class="mb-1.5 block text-sm font-medium">Exemplo de origem</label><input v-model="entryForm.sourceExample" :disabled="!canEditField('examples')" maxlength="1000" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"></div>
          <div><label class="mb-1.5 block text-sm font-medium">Exemplo de destino</label><input v-model="entryForm.targetExample" :disabled="!canEditField('examples')" maxlength="1000" class="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"></div>
          <div class="sm:col-span-2"><label class="mb-1.5 block text-sm font-medium">Observações e ações</label><textarea v-model="entryForm.notes" :disabled="!canEditField('notes')" rows="3" maxlength="3000" class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"></textarea></div>
          <fieldset v-if="auth.isAdmin && selectedSet.clientEditMode === 'selected'" class="sm:col-span-2 rounded-md border border-slate-200 p-4">
            <legend class="px-1 text-sm font-medium text-slate-800">Campos que o cliente pode editar</legend>
            <div class="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <label v-for="field in clientFieldOptions" :key="field.value" class="flex items-center gap-2 text-sm text-slate-600"><input v-model="entryForm.clientEditableFields" type="checkbox" :value="field.value" class="h-4 w-4 rounded border-slate-300">{{ field.label }}</label>
            </div>
          </fieldset>
          <p v-if="modalError" class="sm:col-span-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{{ modalError }}</p>
        </div>
        <footer class="flex justify-end gap-2 border-t border-slate-200 px-6 py-4"><button type="button" class="rounded-md border border-slate-300 px-3 py-2 text-sm" @click="entryModalOpen = false">Cancelar</button><button :disabled="saving" class="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{{ saving ? 'Salvando…' : 'Salvar vínculo' }}</button></footer>
      </form>
    </div>

    <div v-if="attachmentModalOpen && selectedSet" class="fixed inset-0 z-[75] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-slate-950/55" @click="attachmentModalOpen = false"></div>
      <form class="relative w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-xl" @submit.prevent="uploadAttachment">
        <h3 class="text-lg font-semibold text-slate-950">Anexar arquivo</h3>
        <p class="mt-1 text-sm text-slate-500">O original ficará preservado nesta versão do de-para.</p>
        <label class="mt-5 block rounded-lg border border-dashed border-slate-300 px-5 py-7 text-center">
          <input class="sr-only" type="file" accept=".md,.markdown,.txt,.pdf,.csv,.tsv,.json,.html,.htm,.xml,.yaml,.yml,.doc,.docx,.odt,.xls,.xlsx,.ods,.png,.jpg,.jpeg,.webp" required @change="selectAttachmentFile">
          <span class="block text-sm font-medium text-slate-800">{{ attachmentFile?.name || 'Escolher arquivo' }}</span>
          <span class="mt-1 block text-xs text-slate-500">até 10 MB</span>
        </label>
        <label v-if="attachmentTextAvailable" class="mt-4 flex items-start gap-3 rounded-md border border-slate-200 px-3 py-3">
          <input v-model="appendAttachmentToDocument" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-slate-300">
          <span><span class="block text-sm font-medium text-slate-800">Adicionar o texto ao documento</span><span class="mt-0.5 block text-xs text-slate-500">O conteúdo será incluído no final do Markdown atual.</span></span>
        </label>
        <p v-if="modalError" class="mt-3 text-sm text-red-700">{{ modalError }}</p>
        <div class="mt-5 flex justify-end gap-2"><button type="button" class="rounded-md border border-slate-300 px-3 py-2 text-sm" @click="attachmentModalOpen = false">Cancelar</button><button :disabled="saving || !attachmentFile" class="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{{ saving ? 'Enviando…' : 'Anexar' }}</button></div>
      </form>
    </div>

    <div v-if="publishConfirmOpen && selectedSet" class="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-slate-950/55" @click="publishConfirmOpen = false"></div>
      <div class="relative w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
        <h3 class="text-lg font-semibold text-slate-950">Publicar esta versão?</h3>
        <p class="mt-2 text-sm leading-6 text-slate-500">
          <template v-if="selectedSet.clientEditMode === 'none'">
            O cliente passará a ver esta versão protegida. Alterações administrativas futuras exigirão uma nova versão.
          </template>
          <template v-else>
            O cliente passará a ver esta versão e poderá editar o que foi liberado. Cada mudança ficará registrada no histórico para revisão da equipe.
          </template>
        </p>
        <p v-if="pendingCount" class="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Há {{ pendingCount }} vínculo{{ pendingCount === 1 ? '' : 's' }} pendente{{ pendingCount === 1 ? '' : 's' }} ou com atenção.</p>
        <div class="mt-5 flex justify-end gap-2"><button class="rounded-md border border-slate-300 px-3 py-2 text-sm" @click="publishConfirmOpen = false">Revisar</button><button :disabled="saving" class="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" @click="publishSet">{{ saving ? 'Publicando…' : 'Publicar versão' }}</button></div>
      </div>
    </div>

    <div v-if="entryToDelete && selectedSet" class="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-slate-950/55" @click="entryToDelete = null"></div>
      <div class="relative w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
        <h3 class="text-lg font-semibold text-slate-950">Excluir este vínculo?</h3>
        <p class="mt-2 text-sm text-slate-500">{{ entryToDelete.sourcePath }} → {{ entryToDelete.targetPath }} será removido desta versão.</p>
        <div class="mt-5 flex justify-end gap-2"><button class="rounded-md border border-slate-300 px-3 py-2 text-sm" @click="entryToDelete = null">Cancelar</button><button :disabled="saving" class="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" @click="deleteEntry">Excluir vínculo</button></div>
      </div>
    </div>

    <div v-if="attachmentToDelete && selectedSet" class="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-slate-950/55" @click="attachmentToDelete = null"></div>
      <div class="relative w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
        <h3 class="text-lg font-semibold text-slate-950">Remover arquivo?</h3>
        <p class="mt-2 text-sm text-slate-500">{{ attachmentToDelete.fileName }} deixará de fazer parte desta versão.</p>
        <div class="mt-5 flex justify-end gap-2"><button class="rounded-md border border-slate-300 px-3 py-2 text-sm" @click="attachmentToDelete = null">Cancelar</button><button :disabled="saving" class="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" @click="deleteAttachment">Remover</button></div>
      </div>
    </div>

    <div v-if="archiveConfirmOpen && selectedSet" class="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-slate-950/55" @click="archiveConfirmOpen = false"></div>
      <div class="relative w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
        <h3 class="text-lg font-semibold text-slate-950">Arquivar este de-para?</h3>
        <p class="mt-2 text-sm leading-6 text-slate-500">Ele deixará de aparecer imediatamente para o cliente, mas o histórico, vínculos e arquivos serão preservados para consulta interna.</p>
        <div class="mt-5 flex justify-end gap-2"><button class="rounded-md border border-slate-300 px-3 py-2 text-sm" @click="archiveConfirmOpen = false">Cancelar</button><button :disabled="saving" class="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" @click="archiveSet">Arquivar</button></div>
      </div>
    </div>

    <div v-if="deleteSetConfirmOpen && selectedSet" class="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-slate-950/55" @click="deleteSetConfirmOpen = false"></div>
      <div class="relative w-full max-w-md rounded-lg border border-red-200 bg-white p-6 shadow-xl">
        <h3 class="text-lg font-semibold text-slate-950">Excluir definitivamente?</h3>
        <p class="mt-2 text-sm leading-6 text-slate-500">“{{ selectedSet.name }}” e todos os vínculos e anexos desta versão serão removidos. Esta ação não pode ser desfeita.</p>
        <div class="mt-5 flex justify-end gap-2"><button class="rounded-md border border-slate-300 px-3 py-2 text-sm" @click="deleteSetConfirmOpen = false">Cancelar</button><button :disabled="saving" class="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" @click="deleteSet">Excluir de-para</button></div>
      </div>
    </div>

    <div v-if="successMessage" class="fixed bottom-5 right-5 z-[90] rounded-md bg-slate-950 px-4 py-3 text-sm font-medium text-white shadow-lg" aria-live="polite">{{ successMessage }}</div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useApi } from '@/composables/useApi'
import { useAuthStore } from '@/stores/auth'
import MappingHistoryPanel from '@/components/MappingHistoryPanel.vue'
import {
  blankMappingTemplate,
  extractMappingEntries,
  fileToBase64,
  inferMappingMetadata,
  migrationMappingTemplate,
  readTextAttachment,
  renderMappingMarkdown
} from '@/utils/mappingDocument'
import type { MappingAttachment, MappingEntry, MappingEntryClientField, MappingSet } from '@/types'

const props = defineProps<{
  integrationId: number
  initialMappingSetId?: number | null
  processOptions?: Array<{ id: number; referenceCode: string; title: string }>
}>()
const api = useApi()
const auth = useAuthStore()
const mappingSets = ref<MappingSet[]>([])
const selectedSetId = ref('')
const activeTab = ref<'document' | 'fields' | 'history' | 'files' | 'review'>('document')
const entrySearch = ref('')
const entryStatusFilter = ref('')
const entryPage = ref(1)
const entryPageSize = 25
const selectedEntryIds = ref<number[]>([])
const bulkStatus = ref('')
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')
const modalError = ref('')
const successMessage = ref('')
const createModalOpen = ref(false)
const createMode = ref<'template' | 'import'>('template')
const createFile = ref<File | null>(null)
const createFileText = ref('')
const createFileInput = ref<HTMLInputElement | null>(null)
const documentEditorOpen = ref(false)
const documentDraft = ref('')
const documentTextarea = ref<HTMLTextAreaElement | null>(null)
const metadataModalOpen = ref(false)
const entryModalOpen = ref(false)
const attachmentModalOpen = ref(false)
const publishConfirmOpen = ref(false)
const archiveConfirmOpen = ref(false)
const deleteSetConfirmOpen = ref(false)
const entryToDelete = ref<MappingEntry | null>(null)
const attachmentToDelete = ref<MappingAttachment | null>(null)
const attachmentFile = ref<File | null>(null)
const attachmentTextAvailable = ref(false)
const appendAttachmentToDocument = ref(false)
const setForm = ref({ name: '', sourceSystem: '', targetSystem: '', description: '', template: 'complete', processId: '' })
const metadataForm = ref({
  name: '', sourceSystem: '', targetSystem: '', description: '',
  processId: '',
  clientEditMode: 'none' as MappingSet['clientEditMode'],
  clientCanAddEntries: false,
  clientCanDeleteEntries: false,
  clientInstructions: '',
  validationRules: {
    requireStructuredEntries: false,
    blockUnresolved: false,
    blockDuplicateSources: false,
    requireTypes: false
  }
})
const emptyEntryForm = () => ({
  id: null as number | null,
  section: '',
  sourcePath: '',
  sourceType: '',
  targetPath: '',
  targetType: '',
  direction: 'source_to_target' as MappingEntry['direction'],
  transformation: '',
  fallbackValue: '',
  isRequired: false,
  notes: '',
  mappingStatus: 'mapped' as MappingEntry['mappingStatus'],
  clientEditableFields: [] as MappingEntryClientField[],
  sourceExample: '',
  targetExample: ''
})
const entryForm = ref(emptyEntryForm())

const selectedSet = computed(() => mappingSets.value.find(item => String(item.id) === selectedSetId.value) || null)
const clientNextAction = computed(() => {
  if (!selectedSet.value || auth.isAdmin) return null
  if (selectedSet.value.clientEditMode === 'none') {
    return {
      title: 'Consulte e valide o de-para',
      detail: 'Use as abas para conferir o documento, os vínculos e o histórico. Se algo estiver incorreto, registre um comentário no histórico.'
    }
  }
  if (selectedSet.value.hasUnreviewedClientChanges) {
    return {
      title: 'Suas alterações foram registradas',
      detail: 'A equipe técnica poderá conferir exatamente o que mudou. Você pode complementar o contexto na aba Histórico.'
    }
  }
  if (pendingCount.value) {
    return {
      title: `Ajude a resolver ${pendingCount.value} pendência${pendingCount.value === 1 ? '' : 's'}`,
      detail: 'Abra a aba Campos estruturados, filtre por “Pendente” ou “Requer atenção” e preencha somente o que estiver liberado.'
    }
  }
  return {
    title: 'Mapeamento pronto para conferência',
    detail: 'Revise os valores e registre qualquer dúvida ou decisão na aba Histórico.'
  }
})
const canEditDocument = computed(() => Boolean(selectedSet.value && (
  (auth.isAdmin && selectedSet.value.status === 'draft') ||
  (!auth.isAdmin && selectedSet.value.status === 'published' && selectedSet.value.clientEditMode === 'all')
)))
const canAddEntry = computed(() => Boolean(selectedSet.value && (
  (auth.isAdmin && selectedSet.value.status === 'draft') ||
  (!auth.isAdmin && selectedSet.value.status === 'published' && selectedSet.value.clientEditMode === 'all' && selectedSet.value.clientCanAddEntries)
)))
const canDeleteEntry = computed(() => Boolean(selectedSet.value && (
  (auth.isAdmin && selectedSet.value.status === 'draft') ||
  (!auth.isAdmin && selectedSet.value.status === 'published' && selectedSet.value.clientEditMode === 'all' && selectedSet.value.clientCanDeleteEntries)
)))
const canEditEntry = (entry: MappingEntry) => Boolean(selectedSet.value && (
  (auth.isAdmin && selectedSet.value.status === 'draft') ||
  (!auth.isAdmin && selectedSet.value.status === 'published' && (
    selectedSet.value.clientEditMode === 'all' ||
    (selectedSet.value.clientEditMode === 'selected' && entry.clientEditableFields?.length)
  ))
))
const showsEntryActions = computed(() => Boolean(selectedSet.value && (
  (auth.isAdmin && selectedSet.value.status === 'draft') ||
  (!auth.isAdmin && selectedSet.value.status === 'published' && selectedSet.value.clientEditMode !== 'none')
)))
const canEditField = (field: MappingEntryClientField) => {
  if (auth.isAdmin) return true
  if (!selectedSet.value || selectedSet.value.clientEditMode === 'none') return false
  if (selectedSet.value.clientEditMode === 'all') return true
  return entryForm.value.clientEditableFields.includes(field)
}
const clientFieldOptions: Array<{ value: MappingEntryClientField; label: string }> = [
  { value: 'section', label: 'Seção' },
  { value: 'sourcePath', label: 'Campo de origem' },
  { value: 'sourceType', label: 'Tipo de origem' },
  { value: 'targetPath', label: 'Campo de destino' },
  { value: 'targetType', label: 'Tipo de destino' },
  { value: 'direction', label: 'Direção' },
  { value: 'transformation', label: 'Regra / transformação' },
  { value: 'fallbackValue', label: 'Valor padrão' },
  { value: 'isRequired', label: 'Obrigatoriedade' },
  { value: 'examples', label: 'Exemplos' },
  { value: 'notes', label: 'Observações' },
  { value: 'mappingStatus', label: 'Situação' }
]
const renderedDocument = computed(() => renderMappingMarkdown(selectedSet.value?.contentMarkdown || ''))
const pendingCount = computed(() => selectedSet.value?.entries.filter(entry => ['pending', 'attention'].includes(entry.mappingStatus)).length || 0)
const mappingQuality = computed(() => {
  const entries = selectedSet.value?.entries || []
  const mapped = entries.filter(entry => entry.mappingStatus === 'mapped').length
  const ignored = entries.filter(entry => entry.mappingStatus === 'ignored').length
  const unresolved = entries.filter(entry => ['pending', 'attention'].includes(entry.mappingStatus)).length
  const sourceCounts = new Map<string, { key: string; sourcePath: string; count: number }>()
  for (const entry of entries) {
    if (entry.mappingStatus === 'ignored') continue
    const key = `${entry.section || ''}::${entry.sourcePath}`.trim().toLocaleLowerCase('pt-BR')
    const current = sourceCounts.get(key)
    sourceCounts.set(key, {
      key,
      sourcePath: entry.sourcePath,
      count: (current?.count || 0) + 1
    })
  }
  const duplicates = [...sourceCounts.values()].filter(item => item.count > 1)
  const hasContent = Boolean(
    selectedSet.value?.contentMarkdown?.trim() ||
    entries.length ||
    selectedSet.value?.attachments?.length
  )
  const completionPercent = entries.length ? Math.round(((mapped + ignored) / entries.length) * 100) : 0
  const checks = [
    {
      ok: hasContent,
      label: 'Conteúdo documentado',
      detail: hasContent
        ? 'Há documento, campos estruturados ou arquivos de referência.'
        : 'Adicione conteúdo antes de publicar.'
    },
    {
      ok: entries.length > 0,
      label: 'Campos estruturados',
      detail: entries.length
        ? `${entries.length} vínculo${entries.length === 1 ? '' : 's'} disponível${entries.length === 1 ? '' : 'is'} para busca e exportação.`
        : 'Estruture os principais vínculos para facilitar validação e exportação.'
    },
    {
      ok: unresolved === 0,
      label: 'Decisões resolvidas',
      detail: unresolved
        ? `${unresolved} vínculo${unresolved === 1 ? '' : 's'} ainda depende${unresolved === 1 ? '' : 'm'} de definição.`
        : 'Nenhuma pendência estrutural aberta.'
    },
    {
      ok: duplicates.length === 0,
      label: 'Origens sem ambiguidade',
      detail: duplicates.length
        ? `${duplicates.length} origem${duplicates.length === 1 ? '' : 'ens'} aparece${duplicates.length === 1 ? '' : 'm'} mais de uma vez.`
        : 'Nenhuma possível duplicidade encontrada.'
    }
  ]
  const rules = selectedSet.value?.validationRules
  const passesPolicy = Boolean(
    (!rules?.requireStructuredEntries || entries.length > 0) &&
    (!rules?.blockUnresolved || unresolved === 0) &&
    (!rules?.blockDuplicateSources || duplicates.length === 0) &&
    (!rules?.requireTypes || entries.every(entry => entry.sourceType && entry.targetType))
  )
  return {
    mapped,
    unresolved,
    duplicates,
    completionPercent,
    checks,
    ready: hasContent && passesPolicy
  }
})
const filteredEntries = computed(() => {
  if (!selectedSet.value) return []
  const search = entrySearch.value.trim().toLocaleLowerCase('pt-BR')
  return selectedSet.value.entries.filter(entry =>
    (!entryStatusFilter.value || entry.mappingStatus === entryStatusFilter.value) &&
    (!search || [entry.section, entry.sourcePath, entry.targetPath, entry.transformation, entry.fallbackValue, entry.notes]
      .some(value => value?.toLocaleLowerCase('pt-BR').includes(search)))
  )
})
const entryPageCount = computed(() => Math.max(1, Math.ceil(filteredEntries.value.length / entryPageSize)))
const paginatedEntries = computed(() => {
  const start = (entryPage.value - 1) * entryPageSize
  return filteredEntries.value.slice(start, start + entryPageSize)
})
const allVisibleEntriesSelected = computed(() => Boolean(
  paginatedEntries.value.length &&
  paginatedEntries.value.every(entry => selectedEntryIds.value.includes(entry.id))
))
const workspaceTabs = computed(() => [
  { value: 'document' as const, label: 'Documento', count: null },
  { value: 'fields' as const, label: 'Campos estruturados', count: selectedSet.value?.entries.length || 0 },
  { value: 'history' as const, label: 'Histórico', count: selectedSet.value?.hasUnreviewedClientChanges ? 1 : null },
  { value: 'files' as const, label: 'Arquivos', count: selectedSet.value?.attachments?.length || 0 },
  { value: 'review' as const, label: 'Revisão', count: pendingCount.value || null }
])
const editorSnippets = [
  { label: 'Seção', content: '\n\n## Nova seção\n\n' },
  { label: 'Aviso', content: '\n\n:::warning\nEscreva o aviso aqui.\n:::\n\n' },
  { label: 'Tabela', content: '\n\n| Origem | Destino | Status | Observações / ações |\n| --- | --- | --- | --- |\n| [origem] | [destino] | ⚠️ | [preencher] |\n\n' },
  { label: 'Pergunta', content: '\n\n### Pergunta — [título]\n\n[contexto da decisão]\n\n**Resposta:** [preencher]\n\n' },
  { label: 'Checklist', content: '\n\n- [ ] Item a validar\n- [ ] Item a configurar\n\n' },
  { label: 'Divisor', content: '\n\n---\n\n' }
]

const setStatusLabel = (status: MappingSet['status']) => ({ draft: 'Rascunho', published: 'Publicado', archived: 'Arquivado' }[status])
const clientEditModeLabel = (mode: MappingSet['clientEditMode']) => ({ none: 'Somente leitura', all: 'Edição completa', selected: 'Campos selecionados' }[mode])
const setStatusClass = (status: MappingSet['status']) => ({
  draft: 'bg-amber-100 text-amber-800',
  published: 'bg-emerald-100 text-emerald-800',
  archived: 'bg-slate-100 text-slate-600'
}[status])
const entryStatusLabel = (status: MappingEntry['mappingStatus']) => ({
  mapped: 'Mapeado',
  pending: 'Pendente',
  attention: 'Requer atenção',
  ignored: 'Desconsiderado'
}[status])
const entryStatusClass = (status: MappingEntry['mappingStatus']) => ({
  mapped: 'bg-emerald-50 text-emerald-700',
  pending: 'bg-amber-100 text-amber-800',
  attention: 'bg-red-50 text-red-700',
  ignored: 'bg-slate-100 text-slate-600'
}[status])
const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
  : '—'
const formatFileSize = (bytes: number) => bytes < 1024 * 1024
  ? `${Math.max(1, Math.round(bytes / 1024))} KB`
  : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
const showSuccess = (message: string) => {
  successMessage.value = message
  window.setTimeout(() => { successMessage.value = '' }, 3200)
}

const fetchMappings = async (preserveSelection = true) => {
  loading.value = true
  errorMessage.value = ''
  const previousId = preserveSelection ? selectedSetId.value : ''
  try {
    const data = await api.get<{ mappingSets: MappingSet[] }>(`/lambda/integrations/${props.integrationId}/mappings`)
    mappingSets.value = data.mappingSets
    const requestedId = props.initialMappingSetId ? String(props.initialMappingSetId) : ''
    selectedSetId.value = data.mappingSets.some(item => String(item.id) === previousId)
      ? previousId
      : data.mappingSets.some(item => String(item.id) === requestedId)
        ? requestedId
        : (data.mappingSets[0] ? String(data.mappingSets[0].id) : '')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Não foi possível carregar os mapeamentos'
  } finally {
    loading.value = false
  }
}

const openCreateModal = () => {
  createMode.value = 'template'
  createFile.value = null
  createFileText.value = ''
  setForm.value = { name: '', sourceSystem: '', targetSystem: '', description: '', template: 'complete', processId: '' }
  modalError.value = ''
  createModalOpen.value = true
}
const closeCreateModal = () => {
  createModalOpen.value = false
  createFile.value = null
  createFileText.value = ''
  modalError.value = ''
}
const selectCreateFile = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0] || null
  createFile.value = file
  createFileText.value = ''
  modalError.value = ''
  if (!file) return
  if (file.size > 10 * 1024 * 1024) {
    modalError.value = 'O arquivo deve ter no máximo 10 MB'
    createFile.value = null
    return
  }
  createFileText.value = (await readTextAttachment(file)).slice(0, 250_000)
  const inferred = inferMappingMetadata(createFileText.value, file.name)
  setForm.value.name = inferred.name
  if (inferred.sourceSystem) setForm.value.sourceSystem = inferred.sourceSystem
  if (inferred.targetSystem) setForm.value.targetSystem = inferred.targetSystem
}
const createSet = async () => {
  saving.value = true
  modalError.value = ''
  try {
    let contentMarkdown = ''
    if (createMode.value === 'import') {
      contentMarkdown = createFileText.value || `# DE-PARA · ${setForm.value.name} (${setForm.value.sourceSystem} → ${setForm.value.targetSystem})\n\n:::warning\nO documento original está anexado a esta versão. Revise as decisões antes de publicar.\n:::\n`
    } else if (setForm.value.template === 'complete') {
      contentMarkdown = blankMappingTemplate(setForm.value.name, setForm.value.sourceSystem, setForm.value.targetSystem)
    } else if (setForm.value.template === 'migration') {
      contentMarkdown = migrationMappingTemplate(setForm.value.name, setForm.value.sourceSystem, setForm.value.targetSystem)
    }
    const importedEntries = createMode.value === 'import' && contentMarkdown
      ? extractMappingEntries(contentMarkdown, setForm.value.sourceSystem, setForm.value.targetSystem)
      : []
    const attachment = createMode.value === 'import' && createFile.value
      ? {
          fileName: createFile.value.name,
          mimeType: createFile.value.type || 'application/octet-stream',
          contentBase64: await fileToBase64(createFile.value)
        }
      : null
    const data = await api.post<{ mappingSetId: number }>(`/lambda/integrations/${props.integrationId}/mappings`, {
      name: setForm.value.name,
      sourceSystem: setForm.value.sourceSystem,
      targetSystem: setForm.value.targetSystem,
      description: setForm.value.description || null,
      contentMarkdown: contentMarkdown || null,
      processId: setForm.value.processId ? Number(setForm.value.processId) : null,
      entries: importedEntries,
      attachment
    })
    closeCreateModal()
    await fetchMappings(false)
    selectedSetId.value = String(data.mappingSetId)
    activeTab.value = 'document'
    showSuccess(createMode.value === 'import' ? 'De-para importado com sucesso' : 'De-para criado com sucesso')
  } catch (error) {
    modalError.value = error instanceof Error ? error.message : 'Não foi possível criar o de-para'
  } finally {
    saving.value = false
  }
}

const openDocumentEditor = () => {
  documentDraft.value = selectedSet.value?.contentMarkdown || ''
  modalError.value = ''
  documentEditorOpen.value = true
}
const closeDocumentEditor = (force = false) => {
  if (!force && documentDraft.value !== (selectedSet.value?.contentMarkdown || '') &&
      !window.confirm('Descartar as alterações ainda não salvas do documento?')) {
    return
  }
  documentEditorOpen.value = false
  modalError.value = ''
}
const insertSnippet = async (content: string) => {
  const textarea = documentTextarea.value
  if (!textarea) {
    documentDraft.value += content
    return
  }
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  documentDraft.value = `${documentDraft.value.slice(0, start)}${content}${documentDraft.value.slice(end)}`
  await nextTick()
  textarea.focus()
  textarea.setSelectionRange(start + content.length, start + content.length)
}
const saveDocument = async () => {
  if (!selectedSet.value) return
  saving.value = true
  modalError.value = ''
  try {
    await api.patch(`/lambda/mappings/${selectedSet.value.id}`, {
      contentMarkdown: documentDraft.value || null,
      expectedRevision: selectedSet.value.revision
    })
    closeDocumentEditor(true)
    await fetchMappings()
    showSuccess('Documento salvo')
  } catch (error) {
    modalError.value = error instanceof Error ? error.message : 'Não foi possível salvar o documento'
  } finally {
    saving.value = false
  }
}

const openMetadataModal = () => {
  if (!selectedSet.value) return
  metadataForm.value = {
    name: selectedSet.value.name,
    sourceSystem: selectedSet.value.sourceSystem,
    targetSystem: selectedSet.value.targetSystem,
    description: selectedSet.value.description || '',
    processId: selectedSet.value.processId ? String(selectedSet.value.processId) : '',
    clientEditMode: selectedSet.value.clientEditMode || 'none',
    clientCanAddEntries: selectedSet.value.clientCanAddEntries || false,
    clientCanDeleteEntries: selectedSet.value.clientCanDeleteEntries || false,
    clientInstructions: selectedSet.value.clientInstructions || '',
    validationRules: {
      requireStructuredEntries: selectedSet.value.validationRules?.requireStructuredEntries || false,
      blockUnresolved: selectedSet.value.validationRules?.blockUnresolved || false,
      blockDuplicateSources: selectedSet.value.validationRules?.blockDuplicateSources || false,
      requireTypes: selectedSet.value.validationRules?.requireTypes || false
    }
  }
  modalError.value = ''
  metadataModalOpen.value = true
}
const saveMetadata = async () => {
  if (!selectedSet.value) return
  saving.value = true
  modalError.value = ''
  try {
    await api.patch(`/lambda/mappings/${selectedSet.value.id}`, {
      ...metadataForm.value,
      description: metadataForm.value.description || null,
      clientInstructions: metadataForm.value.clientInstructions || null,
      processId: metadataForm.value.processId ? Number(metadataForm.value.processId) : null,
      expectedRevision: selectedSet.value.revision
    })
    metadataModalOpen.value = false
    await fetchMappings()
    showSuccess('Configurações atualizadas')
  } catch (error) {
    modalError.value = error instanceof Error ? error.message : 'Não foi possível atualizar o de-para'
  } finally {
    saving.value = false
  }
}

const openEntryModal = (entry?: MappingEntry) => {
  entryForm.value = entry ? {
    id: entry.id,
    section: entry.section || '',
    sourcePath: entry.sourcePath,
    sourceType: entry.sourceType || '',
    targetPath: entry.targetPath,
    targetType: entry.targetType || '',
    direction: entry.direction,
    transformation: entry.transformation || '',
    fallbackValue: entry.fallbackValue || '',
    isRequired: entry.isRequired,
    notes: entry.notes || '',
    mappingStatus: entry.mappingStatus || 'mapped',
    clientEditableFields: entry.clientEditableFields || [],
    sourceExample: typeof entry.examples?.source === 'string' ? entry.examples.source : '',
    targetExample: typeof entry.examples?.target === 'string' ? entry.examples.target : ''
  } : emptyEntryForm()
  modalError.value = ''
  entryModalOpen.value = true
}
const saveEntry = async () => {
  if (!selectedSet.value) return
  saving.value = true
  modalError.value = ''
  const fullPayload = {
    section: entryForm.value.section || null,
    sourcePath: entryForm.value.sourcePath,
    sourceType: entryForm.value.sourceType || null,
    targetPath: entryForm.value.targetPath,
    targetType: entryForm.value.targetType || null,
    direction: entryForm.value.direction,
    transformation: entryForm.value.transformation || null,
    fallbackValue: entryForm.value.fallbackValue || null,
    isRequired: entryForm.value.isRequired,
    notes: entryForm.value.notes || null,
    mappingStatus: entryForm.value.mappingStatus,
    ...(auth.isAdmin ? { clientEditableFields: entryForm.value.clientEditableFields } : {}),
    examples: {
      ...(entryForm.value.sourceExample ? { source: entryForm.value.sourceExample } : {}),
      ...(entryForm.value.targetExample ? { target: entryForm.value.targetExample } : {})
    }
  }
  const payload = !auth.isAdmin && entryForm.value.id && selectedSet.value.clientEditMode === 'selected'
    ? Object.fromEntries(Object.entries(fullPayload).filter(([field]) => entryForm.value.clientEditableFields.includes(field as MappingEntryClientField)))
    : fullPayload
  Object.assign(payload, { expectedRevision: selectedSet.value.revision })
  try {
    if (entryForm.value.id) await api.patch(`/lambda/mappings/${selectedSet.value.id}/entries/${entryForm.value.id}`, payload)
    else await api.post(`/lambda/mappings/${selectedSet.value.id}/entries`, payload)
    entryModalOpen.value = false
    await fetchMappings()
    showSuccess(entryForm.value.id ? 'Vínculo atualizado' : 'Vínculo adicionado')
  } catch (error) {
    modalError.value = error instanceof Error ? error.message : 'Não foi possível salvar o vínculo'
  } finally {
    saving.value = false
  }
}
const deleteEntry = async () => {
  if (!selectedSet.value || !entryToDelete.value) return
  saving.value = true
  try {
    const suffix = auth.isAdmin ? '' : `?expectedRevision=${selectedSet.value.revision}`
    await api.del(`/lambda/mappings/${selectedSet.value.id}/entries/${entryToDelete.value.id}${suffix}`)
    entryToDelete.value = null
    await fetchMappings()
    showSuccess('Vínculo excluído')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Não foi possível excluir o vínculo'
  } finally {
    saving.value = false
  }
}

const toggleVisibleEntries = () => {
  const visibleIds = paginatedEntries.value.map(entry => entry.id)
  if (allVisibleEntriesSelected.value) {
    selectedEntryIds.value = selectedEntryIds.value.filter(id => !visibleIds.includes(id))
  } else {
    selectedEntryIds.value = [...new Set([...selectedEntryIds.value, ...visibleIds])]
  }
}
const applyBulkStatus = async () => {
  if (!selectedSet.value || !selectedEntryIds.value.length || !bulkStatus.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    await api.patch(`/lambda/mappings/${selectedSet.value.id}/entries/bulk`, {
      entryIds: selectedEntryIds.value,
      changes: { mappingStatus: bulkStatus.value }
    })
    const updated = selectedEntryIds.value.length
    selectedEntryIds.value = []
    bulkStatus.value = ''
    await fetchMappings()
    showSuccess(`${updated} vínculo${updated === 1 ? '' : 's'} atualizado${updated === 1 ? '' : 's'}`)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Não foi possível atualizar os vínculos'
  } finally {
    saving.value = false
  }
}
const handleHistoryChanged = async () => {
  await fetchMappings()
  showSuccess('Histórico e mapeamento atualizados')
}

const selectAttachmentFile = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0] || null
  attachmentFile.value = file
  appendAttachmentToDocument.value = false
  attachmentTextAvailable.value = Boolean(file && await readTextAttachment(file))
}
const uploadAttachment = async () => {
  if (!selectedSet.value || !attachmentFile.value) return
  if (attachmentFile.value.size > 10 * 1024 * 1024) {
    modalError.value = 'O arquivo deve ter no máximo 10 MB'
    return
  }
  saving.value = true
  modalError.value = ''
  try {
    await api.post(`/lambda/mappings/${selectedSet.value.id}/attachments`, {
      fileName: attachmentFile.value.name,
      mimeType: attachmentFile.value.type || 'application/octet-stream',
      contentBase64: await fileToBase64(attachmentFile.value),
      appendToDocument: appendAttachmentToDocument.value
    })
    attachmentModalOpen.value = false
    attachmentFile.value = null
    await fetchMappings()
    showSuccess('Arquivo anexado')
  } catch (error) {
    modalError.value = error instanceof Error ? error.message : 'Não foi possível anexar o arquivo'
  } finally {
    saving.value = false
  }
}
const downloadAttachment = async (attachmentId: number, fileName: string) => {
  if (!selectedSet.value) return
  try {
    const blob = await api.download(`/lambda/mappings/${selectedSet.value.id}/attachments/${attachmentId}`)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Não foi possível baixar o arquivo'
  }
}
const deleteAttachment = async () => {
  if (!selectedSet.value || !attachmentToDelete.value) return
  saving.value = true
  try {
    await api.del(`/lambda/mappings/${selectedSet.value.id}/attachments/${attachmentToDelete.value.id}`)
    attachmentToDelete.value = null
    await fetchMappings()
    showSuccess('Arquivo removido')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Não foi possível remover o arquivo'
  } finally {
    saving.value = false
  }
}

const publishSet = async () => {
  if (!selectedSet.value) return
  saving.value = true
  try {
    await api.patch(`/lambda/mappings/${selectedSet.value.id}`, {
      status: 'published',
      expectedRevision: selectedSet.value.revision
    })
    publishConfirmOpen.value = false
    await fetchMappings()
    showSuccess('Versão publicada para o cliente')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Não foi possível publicar o de-para'
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
    activeTab.value = 'document'
    showSuccess('Nova versão criada')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Não foi possível criar uma nova versão'
  } finally {
    saving.value = false
  }
}

const archiveSet = async () => {
  if (!selectedSet.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    await api.patch(`/lambda/mappings/${selectedSet.value.id}`, {
      status: 'archived',
      expectedRevision: selectedSet.value.revision
    })
    archiveConfirmOpen.value = false
    await fetchMappings(false)
    showSuccess('De-para arquivado e removido do portal do cliente')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Não foi possível arquivar o de-para'
  } finally {
    saving.value = false
  }
}

const deleteSet = async () => {
  if (!selectedSet.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    await api.del(`/lambda/mappings/${selectedSet.value.id}`)
    deleteSetConfirmOpen.value = false
    await fetchMappings(false)
    showSuccess('De-para excluído definitivamente')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Não foi possível excluir o de-para'
  } finally {
    saving.value = false
  }
}

const downloadText = (content: string, fileName: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
const safeFileName = (value: string) => value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const exportMarkdown = () => {
  if (!selectedSet.value) return
  downloadText(selectedSet.value.contentMarkdown || `# ${selectedSet.value.name}\n`, `de-para-${safeFileName(selectedSet.value.name)}.md`, 'text/markdown;charset=utf-8')
}
const exportCsv = () => {
  if (!selectedSet.value) return
  const rows = [
    ['Seção', 'Origem', 'Tipo origem', 'Destino', 'Tipo destino', 'Situação', 'Transformação', 'Fallback', 'Obrigatório', 'Observações'],
    ...selectedSet.value.entries.map(entry => [
      entry.section || '',
      entry.sourcePath,
      entry.sourceType || '',
      entry.targetPath,
      entry.targetType || '',
      entryStatusLabel(entry.mappingStatus),
      entry.transformation || '',
      entry.fallbackValue || '',
      entry.isRequired ? 'Sim' : 'Não',
      entry.notes || ''
    ])
  ]
  const csv = '\uFEFF' + rows.map(row => row.map(value => `"${value.replace(/"/g, '""')}"`).join(',')).join('\r\n')
  downloadText(csv, `de-para-${safeFileName(selectedSet.value.name)}.csv`, 'text/csv;charset=utf-8')
}

watch(() => props.integrationId, () => void fetchMappings(false))
watch(() => props.initialMappingSetId, (mappingSetId) => {
  if (mappingSetId && mappingSets.value.some(item => item.id === mappingSetId)) {
    selectedSetId.value = String(mappingSetId)
  }
})
watch(selectedSetId, () => {
  activeTab.value = 'document'
  entrySearch.value = ''
  entryStatusFilter.value = ''
  entryPage.value = 1
  selectedEntryIds.value = []
})
watch([entrySearch, entryStatusFilter], () => {
  entryPage.value = 1
  selectedEntryIds.value = []
})
watch(entryPageCount, (count) => {
  if (entryPage.value > count) entryPage.value = count
})
const preventUnsavedDocumentClose = (event: BeforeUnloadEvent) => {
  if (documentEditorOpen.value && documentDraft.value !== (selectedSet.value?.contentMarkdown || '')) {
    event.preventDefault()
  }
}
onMounted(() => void fetchMappings(false))
onMounted(() => window.addEventListener('beforeunload', preventUnsavedDocumentClose))
onBeforeUnmount(() => window.removeEventListener('beforeunload', preventUnsavedDocumentClose))
</script>

<style scoped>
.mapping-document {
  color: #334155;
  font-size: 0.875rem;
  line-height: 1.7;
}

.mapping-document :deep(h1) {
  margin: 0 0 1rem;
  color: #020617;
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1.25;
}

.mapping-document :deep(h2) {
  margin: 2rem 0 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #e2e8f0;
  color: #0f172a;
  font-size: 1.125rem;
  font-weight: 650;
  line-height: 1.35;
}

.mapping-document :deep(h3) {
  margin: 1.5rem 0 0.5rem;
  color: #0f172a;
  font-size: 1rem;
  font-weight: 650;
}

.mapping-document :deep(h4) {
  margin: 1.25rem 0 0.5rem;
  color: #0f172a;
  font-size: 0.875rem;
  font-weight: 650;
}

.mapping-document :deep(p) { margin: 0.625rem 0; }
.mapping-document :deep(strong) { color: #0f172a; font-weight: 650; }
.mapping-document :deep(code) { border-radius: 0.25rem; background: #f1f5f9; padding: 0.125rem 0.3rem; color: #0f172a; font-size: 0.8em; }
.mapping-document :deep(pre) { margin: 1rem 0; overflow-x: auto; border-radius: 0.5rem; background: #0f172a; padding: 1rem; color: #e2e8f0; }
.mapping-document :deep(pre code) { background: transparent; padding: 0; color: inherit; font-size: 0.75rem; line-height: 1.6; }
.mapping-document :deep(a) { color: #4f46e5; text-decoration: underline; text-underline-offset: 2px; }
.mapping-document :deep(hr) { margin: 1.75rem 0; border: 0; border-top: 1px solid #e2e8f0; }
.mapping-document :deep(ul),
.mapping-document :deep(ol) { margin: 0.75rem 0; padding-left: 1.5rem; }
.mapping-document :deep(ul) { list-style: disc; }
.mapping-document :deep(ol) { list-style: decimal; }
.mapping-document :deep(li) { margin: 0.3rem 0; }
.mapping-document :deep(.mapping-check) { display: flex; list-style: none; gap: 0.5rem; margin-left: -1.5rem; }
.mapping-document :deep(.mapping-check span) { color: #64748b; font-weight: 700; }
.mapping-document :deep(blockquote) { margin: 1rem 0; border-left: 3px solid #cbd5e1; padding: 0.25rem 0 0.25rem 1rem; color: #475569; }
.mapping-document :deep(.mapping-callout) { margin: 1rem 0; border: 1px solid #e2e8f0; border-left-width: 3px; border-radius: 0.375rem; padding: 0.75rem 1rem; background: #f8fafc; }
.mapping-document :deep(.mapping-callout--warning) { border-color: #fcd34d; background: #fffbeb; color: #78350f; }
.mapping-document :deep(.mapping-callout--danger) { border-color: #fca5a5; background: #fef2f2; color: #7f1d1d; }
.mapping-document :deep(.mapping-callout--success) { border-color: #86efac; background: #f0fdf4; color: #14532d; }
.mapping-document :deep(.mapping-callout--info) { border-color: #93c5fd; background: #eff6ff; color: #1e3a8a; }
.mapping-document :deep(.mapping-callout p:first-child) { margin-top: 0; }
.mapping-document :deep(.mapping-callout p:last-child) { margin-bottom: 0; }
.mapping-document :deep(.mapping-table-wrap) { margin: 1rem 0; overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 0.5rem; }
.mapping-document :deep(table) { width: 100%; min-width: 640px; border-collapse: collapse; text-align: left; }
.mapping-document :deep(th) { border-bottom: 1px solid #e2e8f0; background: #f8fafc; padding: 0.65rem 0.75rem; color: #475569; font-size: 0.75rem; font-weight: 650; }
.mapping-document :deep(td) { border-bottom: 1px solid #f1f5f9; padding: 0.7rem 0.75rem; vertical-align: top; }
.mapping-document :deep(tr:last-child td) { border-bottom: 0; }
</style>
