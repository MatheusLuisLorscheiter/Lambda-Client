<template>
  <div class="min-h-screen bg-slate-50 flex flex-col">
    <!-- Navigation -->
    <nav class="bg-white shadow-sm border-b border-slate-200">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between h-16">
          <div class="flex items-center space-x-3">
            <img :src="logoDark" alt="Logo da empresa" class="h-8 w-auto" />
            <div>
              <h1 class="text-lg font-semibold text-slate-900">Painel do Admin</h1>
              <p class="text-xs text-slate-500">{{ auth.user?.companyName }}</p>
            </div>
          </div>
          <div class="flex items-center space-x-4">
            <div class="text-right">
              <p class="text-sm font-medium text-slate-900">{{ auth.user?.email }}</p>
              <p class="text-xs text-slate-500">Acesso Administrativo</p>
            </div>
            <button
              @click="handleLogout"
              class="inline-flex items-center px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sair
            </button>
          </div>
        </div>
      </div>
    </nav>

    <main class="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 flex-1 w-full">
      <!-- Header with Stats -->
      <div class="mb-8">
        <h2 class="text-2xl font-semibold tracking-tight text-slate-900">{{ adminPageTitle }}</h2>
        <p class="mt-1 text-sm text-slate-600">{{ adminPageDescription }}</p>
      </div>

      <!-- Quick Stats -->
      <div v-if="activeTab === 'integrations'" class="mb-8 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 md:grid-cols-3">
        <div class="bg-white p-5">
          <div class="flex items-center">
            <div class="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
              <svg class="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div class="ml-4">
              <p class="text-sm font-medium text-slate-500">Integrações</p>
              <p class="text-2xl font-bold text-slate-900">{{ integrations.length }}</p>
            </div>
          </div>
        </div>
        <div class="bg-white p-5">
          <div class="flex items-center">
            <div class="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
              <svg class="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div class="ml-4">
              <p class="text-sm font-medium text-slate-500">Empresas</p>
              <p class="text-2xl font-bold text-slate-900">{{ companies.length }}</p>
            </div>
          </div>
        </div>
        <div class="bg-white p-5">
          <div class="flex items-center">
            <div class="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div class="ml-4">
              <p class="text-sm font-medium text-slate-500">Logs de auditoria</p>
              <p class="text-2xl font-bold text-slate-900">{{ auditPagination.total }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="border-b border-slate-200">
          <nav class="flex -mb-px">
            <button
              @click="activeTab = 'integrations'"
              :class="[
                'px-6 py-4 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'integrations'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              ]"
            >
              <svg class="w-5 h-5 inline mr-2 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Integrações
            </button>
            <button
              @click="activeTab = 'clients'"
              :class="[
                'px-6 py-4 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'clients'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              ]"
            >
              <svg class="w-5 h-5 inline mr-2 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              Clientes
            </button>
            <button
              @click="activeTab = 'processes'"
              :class="[
                'px-6 py-4 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'processes'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              ]"
            >
              Processos
            </button>
            <button
              @click="activeTab = 'mappings'"
              :class="[
                'px-6 py-4 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'mappings'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              ]"
            >
              Mapeamentos
            </button>
            <button
              @click="activeTab = 'audit'"
              :class="[
                'px-6 py-4 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'audit'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              ]"
            >
              <svg class="w-5 h-5 inline mr-2 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Logs de auditoria
            </button>
            <button
              @click="activeTab = 'mcp'"
              :class="[
                'px-6 py-4 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'mcp'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              ]"
            >
              <svg class="w-5 h-5 inline mr-2 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Acesso MCP
            </button>
          </nav>
        </div>

        <!-- Integrations Tab -->
        <div v-if="activeTab === 'integrations'" class="p-6">
          <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <label class="block min-w-0 flex-1 sm:max-w-lg"><span class="mb-1 block text-xs font-medium text-slate-500">Buscar integração</span><input v-model="integrationSearch" type="search" placeholder="Nome, função, região ou empresa" class="min-h-10 w-full rounded-md border border-slate-300 px-3 text-sm" /></label>
            <button class="min-h-10 rounded-md bg-slate-950 px-4 text-sm font-medium text-white" @click="integrationCreateModal = true">+ Nova integração</button>
          </div>
          <!-- Add Integration Form -->
          <div v-if="integrationCreateModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-slate-950/55" @click="integrationCreateModal = false"></div>
            <div class="relative max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold text-slate-900">Adicionar nova integração</h3>
              <div class="flex items-center gap-2">
                <button type="button" @click="showIntegrationHelp = true" class="inline-flex items-center px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors">Ajuda</button>
                <button type="button" class="rounded-md p-2 text-slate-500 hover:bg-slate-100" @click="integrationCreateModal = false">✕</button>
              </div>
            </div>
            <form @submit.prevent="addIntegration" class="space-y-4">
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label class="block text-sm font-medium text-slate-700 mb-1">Nome da integração</label>
                  <input
                    v-model="newIntegration.name"
                    type="text"
                    required
                    placeholder="ex.: API Produção"
                    class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-700 mb-1">Nome da função</label>
                  <input
                    v-model="newIntegration.functionName"
                    type="text"
                    required
                    placeholder="ex.: minha-funcao-lambda"
                    class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-700 mb-1">Região AWS</label>
                  <select
                    v-model="newIntegration.region"
                    required
                    class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                  >
                    <optgroup label="North America">
                      <option value="us-east-1">US East (N. Virginia) - us-east-1</option>
                      <option value="us-east-2">US East (Ohio) - us-east-2</option>
                      <option value="us-west-1">US West (N. California) - us-west-1</option>
                      <option value="us-west-2">US West (Oregon) - us-west-2</option>
                      <option value="ca-central-1">Canada (Central) - ca-central-1</option>
                    </optgroup>
                    <optgroup label="South America">
                      <option value="sa-east-1">South America (São Paulo) - sa-east-1</option>
                    </optgroup>
                    <optgroup label="Europe">
                      <option value="eu-west-1">Europe (Ireland) - eu-west-1</option>
                      <option value="eu-west-2">Europe (London) - eu-west-2</option>
                      <option value="eu-west-3">Europe (Paris) - eu-west-3</option>
                      <option value="eu-central-1">Europe (Frankfurt) - eu-central-1</option>
                      <option value="eu-north-1">Europe (Stockholm) - eu-north-1</option>
                    </optgroup>
                    <optgroup label="Asia Pacific">
                      <option value="ap-southeast-1">Asia Pacific (Singapore) - ap-southeast-1</option>
                      <option value="ap-southeast-2">Asia Pacific (Sydney) - ap-southeast-2</option>
                      <option value="ap-northeast-1">Asia Pacific (Tokyo) - ap-northeast-1</option>
                      <option value="ap-northeast-2">Asia Pacific (Seoul) - ap-northeast-2</option>
                      <option value="ap-south-1">Asia Pacific (Mumbai) - ap-south-1</option>
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-700 mb-1">Memória (MB)</label>
                  <input
                    v-model.number="newIntegration.memoryMb"
                    type="number"
                    min="128"
                    step="64"
                    required
                    placeholder="128"
                    class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-700 mb-1">Exibir custos no painel</label>
                  <label class="flex items-center justify-between px-4 py-2.5 border border-slate-300 rounded-lg bg-white">
                    <span class="text-sm text-slate-600">Mostrar custo estimado</span>
                    <input
                      v-model="newIntegration.showCostEstimate"
                      type="checkbox"
                      class="h-4 w-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                    />
                  </label>
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-700 mb-1">Empresa</label>
                  <select
                    v-model="newIntegration.companyId"
                    @change="newIntegration.processIds = []"
                    required
                    class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                  >
                    <option value="">Selecione uma empresa</option>
                    <option v-for="company in companies" :key="company.id" :value="company.id">
                      {{ company.name }}
                    </option>
                  </select>
                </div>
                <div class="md:col-span-2 lg:col-span-3 rounded-lg border border-slate-200 bg-white p-4">
                  <div>
                    <h4 class="text-sm font-semibold text-slate-900">Processos relacionados</h4>
                    <p class="mt-1 text-xs text-slate-500">
                      Vincule esta automação à entrega que originou o desenvolvimento ou crie um novo processo.
                    </p>
                  </div>

                  <div v-if="newIntegrationProcessOptions.length" class="mt-4 grid gap-2 md:grid-cols-2">
                    <label
                      v-for="process in newIntegrationProcessOptions"
                      :key="process.id"
                      class="flex items-start gap-3 rounded-md border border-slate-200 px-3 py-2.5 hover:bg-slate-50"
                    >
                      <input v-model="newIntegration.processIds" type="checkbox" :value="process.id" class="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600" />
                      <span class="min-w-0">
                        <span class="block truncate text-sm font-medium text-slate-800">{{ process.title }}</span>
                        <span class="text-xs text-slate-500">{{ getProcessStatusLabel(process.status) }}</span>
                      </span>
                    </label>
                  </div>
                  <p v-else class="mt-3 text-sm text-slate-500">
                    {{ newIntegration.companyId ? 'Esta empresa ainda não possui processos.' : 'Selecione uma empresa para ver os processos.' }}
                  </p>

                  <label class="mt-4 flex items-center gap-2 border-t border-slate-200 pt-4 text-sm font-medium text-slate-700">
                    <input v-model="newIntegration.createProcess.enabled" type="checkbox" class="h-4 w-4 rounded border-slate-300 text-indigo-600" />
                    Criar um novo processo a partir desta integração
                  </label>
                  <div v-if="newIntegration.createProcess.enabled" class="mt-3 grid gap-3 md:grid-cols-2">
                    <input v-model="newIntegration.createProcess.title" maxlength="160" :placeholder="`Implantação: ${newIntegration.name || 'nome da integração'}`" class="rounded-md border border-slate-300 px-3 py-2.5 text-sm" />
                    <select v-model="newIntegration.createProcess.status" class="rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm">
                      <option value="analysis">Em análise</option>
                      <option value="queued">Na fila</option>
                      <option value="in_progress">Em desenvolvimento</option>
                      <option value="validation">Em validação</option>
                      <option value="delivered">Entregue</option>
                    </select>
                    <textarea v-model="newIntegration.createProcess.description" rows="2" placeholder="Contexto da entrega e resultado esperado (opcional)" class="resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm md:col-span-2"></textarea>
                  </div>
                </div>
                <div class="md:col-span-2 lg:col-span-3">
                  <div class="flex items-center justify-between mb-1">
                    <label class="block text-sm font-medium text-slate-700">Documentações (links)</label>
                    <label class="inline-flex items-center text-xs text-slate-600 space-x-2">
                      <input
                        v-model="showDocsPreview"
                        type="checkbox"
                        class="h-4 w-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                      />
                      <span>Embed</span>
                    </label>
                  </div>
                  <div class="flex flex-col md:flex-row gap-2">
                    <input
                      v-model="newDocumentationLink"
                      type="url"
                      placeholder="https://sua-doc.com/guia"
                      class="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    />
                    <button
                      type="button"
                      @click="addDocumentationLink"
                      class="inline-flex items-center px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50"
                    >
                      Adicionar link
                    </button>
                  </div>
                  <div v-if="newIntegration.documentationLinks.length" class="mt-3 space-y-2">
                    <div
                      v-for="(link, index) in newIntegration.documentationLinks"
                      :key="`${link}-${index}`"
                      class="flex items-center justify-between px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    >
                      <span class="truncate">{{ link }}</span>
                      <button
                        type="button"
                        @click="removeDocumentationLink(index)"
                        class="text-xs text-red-600 hover:text-red-700"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                  <div v-if="showDocsPreview && newIntegration.documentationLinks.length" class="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Embed</p>
                    <div class="mt-3 space-y-4">
                      <div v-for="(link, index) in newIntegration.documentationLinks" :key="`preview-${index}`" class="space-y-2">
                        <div class="w-full h-40 rounded-lg border border-slate-200 bg-slate-100 overflow-hidden">
                          <iframe
                            :src="link"
                            class="w-full h-full"
                            loading="lazy"
                            referrerpolicy="no-referrer"
                            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                            title="Documentação"
                          ></iframe>
                        </div>
                        <a
                          :href="link"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700"
                        >
                          Abrir em nova aba
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-700 mb-1">Access Key ID da AWS</label>
                  <input
                    v-model="newIntegration.accessKeyId"
                    type="text"
                    required
                    placeholder="AKIA..."
                    class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-mono"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-700 mb-1">Secret Access Key da AWS</label>
                  <input
                    v-model="newIntegration.secretAccessKey"
                    type="password"
                    required
                    placeholder="••••••••"
                    class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-mono"
                  />
                </div>
              </div>
              <div class="flex justify-end pt-2">
                <button
                  type="submit"
                  :disabled="integrationLoading"
                  class="inline-flex items-center px-5 py-2.5 border border-transparent rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
                >
                  <svg v-if="integrationLoading" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <svg v-else class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                  </svg>
                  Adicionar integração
                </button>
              </div>
            </form>
            </div>
          </div>

          <!-- Integrations List -->
          <div v-if="filteredIntegrations.length > 0" class="space-y-4">
            <div
              v-for="integration in filteredIntegrations"
              :key="integration.id"
              class="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center space-x-4">
                  <div class="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                    <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <div class="flex flex-wrap items-center gap-2">
                      <h4 class="text-base font-semibold text-slate-900">{{ integration.name }}</h4>
                      <span v-if="integration.lastCheckStatus" class="rounded-full px-2 py-0.5 text-xs font-medium" :class="integration.lastCheckStatus === 'healthy' ? 'bg-emerald-100 text-emerald-800' : integration.lastCheckStatus === 'degraded' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'">
                        {{ integration.lastCheckStatus === 'healthy' ? 'Saudável' : integration.lastCheckStatus === 'degraded' ? 'Atenção' : 'Indisponível' }}
                      </span>
                    </div>
                    <p class="text-sm text-slate-500">
                      <span class="font-mono">{{ integration.functionName }}</span>
                      <span class="mx-2">•</span>
                      <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                        {{ integration.region }}
                      </span>
                      <span class="mx-2">•</span>
                      <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                        {{ integration.memoryMb || 128 }} MB
                      </span>
                      <span v-if="integration.showCostEstimate === false" class="mx-2">•</span>
                      <span
                        v-if="integration.showCostEstimate === false"
                        class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700"
                      >
                        Custos ocultos
                      </span>
                      <span v-if="integration.companyName" class="mx-2">•</span>
                      <span
                        v-if="integration.companyName"
                        class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600"
                      >
                        {{ integration.companyName }}
                      </span>
                    </p>
                    <p v-if="integration.lastCheckMessage" class="mt-1 text-xs text-slate-400">
                      {{ integration.lastCheckMessage }}<span v-if="integration.lastCheckedAt"> · {{ new Date(integration.lastCheckedAt).toLocaleString('pt-BR') }}</span>
                    </p>
                    <div class="mt-2 flex flex-wrap items-center gap-1.5">
                      <span
                        v-for="process in integration.processes"
                        :key="process.id"
                        class="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700"
                      >
                        {{ process.title }} · {{ getProcessStatusLabel(process.status) }}
                      </span>
                      <span v-if="!integration.processes?.length" class="text-xs text-amber-700">
                        Sem processo vinculado
                      </span>
                    </div>
                  </div>
                </div>
                <div class="flex items-center space-x-2">
                  <button
                    @click="openEditIntegration(integration)"
                    class="inline-flex items-center px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                  >
                    <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5h2m2 0h2a2 2 0 012 2v2m0 2v2a2 2 0 01-2 2h-2m-2 0h-2m-2 0H7a2 2 0 01-2-2v-2m0-2V7a2 2 0 012-2h2" />
                    </svg>
                    Editar
                  </button>
                  <button
                    @click="testIntegration(integration)"
                    :disabled="testingId === integration.id"
                    class="inline-flex items-center px-3 py-2 border border-emerald-300 rounded-lg text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 transition-colors"
                  >
                    <svg v-if="testingId === integration.id" class="animate-spin h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <svg v-else class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Testar
                  </button>
                  <button
                    @click="openInvokeModal(integration)"
                    class="inline-flex items-center px-3 py-2 border border-indigo-300 rounded-lg text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                  >
                    <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Invocar
                  </button>
                  <button
                    @click="deleteIntegration(integration)"
                    class="inline-flex items-center px-3 py-2 border border-red-300 rounded-lg text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                  >
                    <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Excluir
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="text-center py-12 text-slate-500">
            <svg class="mx-auto h-12 w-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <p class="mt-4 text-sm">Nenhuma integração ainda. Adicione a primeira integração Lambda acima.</p>
          </div>
        </div>

        <!-- Clients Tab -->
        <div v-if="activeTab === 'processes'" class="p-6">
          <AdminProcessManager :companies="companies" />
        </div>

        <div v-if="activeTab === 'mappings'" class="p-6">
          <div class="mb-6 border-b border-slate-200 pb-5">
            <h3 class="text-lg font-semibold text-slate-900">Mapeamentos de dados</h3>
            <p class="mt-1 text-sm text-slate-500">Mantenha o de-para versionado que será apresentado ao cliente como fonte da verdade.</p>
            <label class="mt-4 block max-w-xl">
              <span class="mb-1.5 block text-sm font-medium text-slate-700">Integração</span>
              <select v-model="adminMappingIntegrationId" class="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm">
                <option value="">Selecione uma integração</option>
                <option v-for="integration in integrations" :key="integration.id" :value="String(integration.id)">{{ integration.companyName }} · {{ integration.name }} · {{ integration.functionName }}</option>
              </select>
            </label>
          </div>
          <MappingWorkspace
            v-if="adminMappingIntegrationId"
            :integration-id="Number(adminMappingIntegrationId)"
            :process-options="adminMappingProcessOptions"
          />
          <div v-else class="rounded-lg border border-dashed border-slate-300 px-6 py-12 text-center text-sm text-slate-500">Selecione uma integração para gerenciar seus mapas.</div>
        </div>

        <div v-if="activeTab === 'clients'" class="p-6">
          <div class="mb-5 flex flex-wrap justify-end gap-2">
            <button class="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700" @click="companyCreateModal = true">+ Nova empresa</button>
            <button class="rounded-md bg-slate-950 px-4 py-2.5 text-sm font-medium text-white" @click="clientCreateModal = true">+ Novo cliente</button>
          </div>
          <!-- Add Company Form -->
          <div v-if="companyCreateModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-slate-950/55" @click="companyCreateModal = false"></div>
            <div class="relative w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
            <div class="mb-4 flex items-center justify-between"><h3 class="text-lg font-semibold text-slate-900">Criar empresa</h3><button class="rounded-md p-2 text-slate-500 hover:bg-slate-100" @click="companyCreateModal = false">✕</button></div>
            <form @submit.prevent="addCompany" class="flex flex-col md:flex-row md:items-end gap-4">
              <div class="flex-1">
                <label class="block text-sm font-medium text-slate-700 mb-1">Nome da empresa</label>
                <input
                  v-model="newCompanyName"
                  type="text"
                  required
                  placeholder="ex.: Acme Corp"
                  class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                />
              </div>
              <button
                type="submit"
                :disabled="companyLoading"
                class="inline-flex items-center justify-center px-5 py-2.5 border border-transparent rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
              >
                <svg v-if="companyLoading" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <svg v-else class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                Criar empresa
              </button>
            </form>
            </div>
          </div>

          <!-- Add Client Form -->
          <div v-if="clientCreateModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-slate-950/55" @click="clientCreateModal = false"></div>
            <div class="relative w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
            <div class="mb-4 flex items-center justify-between"><h3 class="text-lg font-semibold text-slate-900">Criar cliente</h3><button class="rounded-md p-2 text-slate-500 hover:bg-slate-100" @click="clientCreateModal = false">✕</button></div>
            <form @submit.prevent="addClient" class="space-y-4">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
                  <input
                    v-model="newClient.email"
                    type="email"
                    required
                    placeholder="cliente@empresa.com"
                    class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-700 mb-1">Senha</label>
                  <input
                    v-model="newClient.password"
                    type="password"
                    required
                    minlength="8"
                    placeholder="Mín. 8 caracteres"
                    class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  />
                </div>
                <div class="md:col-span-2">
                  <div class="flex items-center justify-between mb-2">
                    <label class="block text-sm font-medium text-slate-700">Empresa</label>
                    <label class="inline-flex items-center text-xs text-slate-500 space-x-2">
                      <input
                        v-model="createNewCompany"
                        type="checkbox"
                        class="h-4 w-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                      />
                      <span>Criar nova empresa</span>
                    </label>
                  </div>
                  <select
                    v-if="!createNewCompany"
                    v-model="newClient.companyId"
                    class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                  >
                    <option value="">Selecione uma empresa</option>
                    <option v-for="company in companies" :key="company.id" :value="company.id">
                      {{ company.name }}
                    </option>
                  </select>
                  <input
                    v-else
                    v-model="newClient.companyName"
                    type="text"
                    placeholder="Nome da nova empresa"
                    class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  />
                </div>
              </div>
              <div class="flex justify-end pt-2">
                <button
                  type="submit"
                  :disabled="clientLoading"
                  class="inline-flex items-center px-5 py-2.5 border border-transparent rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 transition-colors"
                >
                  <svg v-if="clientLoading" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <svg v-else class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  Criar cliente
                </button>
              </div>
            </form>
            </div>
          </div>

          <!-- Clients List -->
          <div v-if="clients.length > 0" class="space-y-4">
            <div
              v-for="client in clients"
              :key="client.id"
              class="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center space-x-4">
                  <div class="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
                    <span class="text-white text-lg font-semibold">{{ client.email.charAt(0).toUpperCase() }}</span>
                  </div>
                  <div>
                    <h4 class="text-base font-semibold text-slate-900">{{ client.email }}</h4>
                    <p class="text-sm text-slate-500">
                      <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">
                        Cliente
                      </span>
                      <span
                        :class="client.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'"
                        class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ml-2"
                      >
                        {{ client.isActive ? 'Ativo' : 'Inativo' }}
                      </span>
                      <span class="mx-2">•</span>
                      <span>{{ getCompanyIntegrationCount(client.companyId) }} integração(ões)</span>
                    </p>
                    <p class="text-xs text-slate-400 mt-1">Empresa: {{ client.companyName }}</p>
                  </div>
                </div>
                <div class="flex items-center space-x-2">
                  <div class="flex items-center space-x-2">
                    <select
                      v-model="transferSelection[client.id]"
                      class="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option v-for="company in companies" :key="company.id" :value="String(company.id)">
                        {{ company.name }}
                      </option>
                    </select>
                    <button
                      @click="transferClientCompany(client)"
                      class="inline-flex items-center px-3 py-2 border border-indigo-300 rounded-lg text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                    >
                      <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16l-4-4m0 0l4-4m-4 4h18" />
                      </svg>
                      Transferir
                    </button>
                  </div>
                  <button
                    @click="resendInvite(client)"
                    class="inline-flex items-center px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                  >
                    <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Reenviar convite
                  </button>
                  <button
                    @click="toggleClientStatus(client)"
                    class="inline-flex items-center px-3 py-2 border rounded-lg text-sm font-medium transition-colors"
                    :class="client.isActive
                      ? 'border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100'
                      : 'border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'"
                  >
                    <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {{ client.isActive ? 'Inativar' : 'Ativar' }}
                  </button>
                  <button
                    @click="deleteClient(client)"
                    class="inline-flex items-center px-3 py-2 border border-red-300 rounded-lg text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                  >
                    <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Excluir
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="text-center py-12 text-slate-500">
            <svg class="mx-auto h-12 w-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <p class="mt-4 text-sm">Nenhum cliente ainda. Crie o primeiro acima.</p>
          </div>
        </div>

        <!-- Audit Logs Tab -->
        <div v-if="activeTab === 'audit'" class="p-6">
          <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div class="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row">
              <div class="min-w-0 flex-1"><label class="mb-1 block text-xs font-medium text-slate-500">Buscar atividade</label><input v-model="auditSearch" type="search" placeholder="Ação, usuário ou recurso" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" @keyup.enter="resetAuditPagination" /></div>
              <div><label class="mb-1 block text-xs font-medium text-slate-500">Empresa</label><select v-model="auditCompanyFilter" class="min-w-52 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" @change="resetAuditPagination"><option value="">Todas</option><option v-for="company in companies" :key="company.id" :value="String(company.id)">{{ company.name }}</option></select></div>
            </div>
            <button
              :disabled="auditLoading"
              @click="fetchAuditLogs"
              class="inline-flex items-center px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {{ auditLoading ? 'Carregando…' : 'Atualizar' }}
            </button>
          </div>

          <div v-if="auditLogs.length > 0" class="overflow-x-auto">
            <table class="min-w-full">
              <thead class="bg-slate-50">
                <tr>
                  <th class="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Data/hora</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Ação</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Usuário</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Recurso</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Endereço IP</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-slate-100">
                <tr v-for="log in auditLogs" :key="log.id" class="hover:bg-slate-50">
                  <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-500">
                    {{ new Date(log.createdAt).toLocaleString() }}
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap">
                    <span
                      :class="getActionClass(log.action)"
                      class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                    >
                      {{ log.action }}
                    </span>
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-900">
                    <span class="block">{{ log.userEmail || 'Sistema' }}</span>
                    <span class="mt-0.5 block text-xs text-slate-400">{{ log.companyName }}</span>
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-500">
                    {{ log.resourceType ? `${log.resourceType} #${log.resourceId}` : '-' }}
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-500 font-mono">
                    {{ log.ipAddress || '-' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="auditPagination.total > auditPagination.limit" class="flex flex-col gap-2 border-t border-slate-200 px-1 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p class="text-xs text-slate-500">
              Exibindo {{ auditPagination.offset + 1 }}–{{ Math.min(auditPagination.offset + auditLogs.length, auditPagination.total) }} de {{ auditPagination.total }} logs
            </p>
            <div class="flex items-center gap-2">
              <button :disabled="auditLoading || auditPagination.offset === 0" class="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium disabled:opacity-40" @click="changeAuditPage(-1)">Anterior</button>
              <span class="min-w-20 text-center text-xs text-slate-500">Página {{ Math.floor(auditPagination.offset / auditPagination.limit) + 1 }}</span>
              <button :disabled="auditLoading || !auditPagination.hasMore" class="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium disabled:opacity-40" @click="changeAuditPage(1)">Próxima</button>
            </div>
          </div>
          <div v-else-if="!auditLoading && !auditLogs.length" class="text-center py-12 text-slate-500">
            <svg class="mx-auto h-12 w-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p class="mt-4 text-sm">Nenhum log de auditoria ainda.</p>
          </div>
        </div>
        <!-- MCP Tab -->
        <div v-if="activeTab === 'mcp'" class="p-6">
          <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div class="flex-1">
              <label class="block min-w-0 sm:max-w-lg">
                <span class="mb-1 block text-xs font-medium text-slate-500">Buscar empresa</span>
                <input v-model="mcpSearch" type="search" placeholder="Nome da empresa ou prefixo da chave" class="min-h-10 w-full rounded-md border border-slate-300 px-3 text-sm" />
              </label>
            </div>
            <div class="flex items-center gap-4 text-sm">
              <div class="text-slate-500">
                Empresas ativas: <span class="font-semibold text-slate-900">{{ mcpStats.activeCompaniesCount }}</span>
              </div>
              <div class="text-slate-500">
                Chamadas hoje: <span class="font-semibold text-slate-900">{{ mcpStats.totalMcpCalls }}</span>
              </div>
              <button @click="fetchMcpCompanies" class="text-indigo-600 hover:text-indigo-800" title="Atualizar">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              </button>
            </div>
          </div>
          
          <div v-if="mcpLoading" class="py-12 text-center text-slate-500">
            <svg class="mx-auto h-8 w-8 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p class="mt-2 text-sm">Carregando configurações MCP...</p>
          </div>
          
          <div v-else class="overflow-x-auto rounded-lg border border-slate-200 shadow-sm">
            <table class="min-w-full divide-y divide-slate-200">
              <thead class="bg-slate-50">
                <tr>
                  <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Empresa</th>
                  <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status MCP</th>
                  <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Chave API</th>
                  <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-slate-200">
                <tr v-for="company in filteredMcpCompanies" :key="company.companyId" class="hover:bg-slate-50">
                  <td class="px-4 py-4 whitespace-nowrap">
                    <div class="text-sm font-medium text-slate-900">{{ company.companyName }}</div>
                  </td>
                  <td class="px-4 py-4 whitespace-nowrap">
                    <button
                      @click="toggleMcpStatus(company)"
                      :class="['relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2', company.isEnabled ? 'bg-indigo-600' : 'bg-slate-200']"
                    >
                      <span :class="['pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out', company.isEnabled ? 'translate-x-4' : 'translate-x-0']"></span>
                    </button>
                    <span class="ml-2 text-xs text-slate-500">{{ company.isEnabled ? 'Ativo' : 'Inativo' }}</span>
                  </td>
                  <td class="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                    <div v-if="company.hasToken" class="flex items-center gap-2">
                      <span class="font-mono bg-slate-100 px-2 py-1 rounded text-xs">{{ company.apiKeyPrefix }}...</span>
                      <button @click="generateMcpToken(company)" class="text-indigo-600 hover:text-indigo-900 text-xs" title="Rotacionar Chave">Rotacionar</button>
                    </div>
                    <div v-else>
                      <button @click="generateMcpToken(company)" class="text-indigo-600 hover:text-indigo-900 text-xs">Gerar Chave</button>
                    </div>
                  </td>
                  <td class="px-4 py-4 whitespace-nowrap text-sm font-medium">
                    <div class="flex space-x-3">
                      <button @click="openMcpPermissionsModal(company)" class="text-indigo-600 hover:text-indigo-900" :disabled="!company.isEnabled">Permissões</button>
                      <button @click="openMcpAuditModal(company)" class="text-slate-600 hover:text-slate-900" :disabled="!company.isEnabled">Logs de Uso</button>
                    </div>
                  </td>
                </tr>
                <tr v-if="filteredMcpCompanies.length === 0">
                  <td colspan="4" class="px-4 py-8 text-center text-sm text-slate-500">
                    Nenhuma empresa encontrada.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>

    <footer class="py-6 text-center text-xs text-slate-500">
      Copyright {{ new Date().getFullYear() }} ©
      <a
        href="https://chavemestragestao.com.br/"
        target="_blank"
        rel="noopener noreferrer"
        class="font-medium text-slate-600 hover:text-slate-800"
      >
        Chave Mestra Gestão
      </a>
    </footer>

    <!-- Toast Notifications -->
    <div class="fixed bottom-4 right-4 z-[60] space-y-2">
      <transition-group name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          :class="[
            'px-4 py-3 rounded-lg shadow-lg flex items-center space-x-3 min-w-[300px]',
            toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
          ]"
        >
          <svg v-if="toast.type === 'success'" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span class="text-sm font-medium">{{ toast.message }}</span>
        </div>
      </transition-group>
    </div>

    <!-- Confirmation Modal -->
    <transition name="fade">
      <div v-if="confirmModal.visible" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-slate-900/50" @click="handleModalCancel"></div>
        <div class="relative bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md mx-4 p-6">
          <h3 class="text-lg font-semibold text-slate-900">{{ confirmModal.title }}</h3>
          <p class="mt-2 text-sm text-slate-600">{{ confirmModal.message }}</p>
          <div class="mt-6 flex justify-end space-x-3">
            <button
              @click="handleModalCancel"
              class="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 border border-slate-300 hover:bg-slate-50"
            >
              {{ confirmModal.cancelLabel }}
            </button>
            <button
              @click="handleModalConfirm"
              class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
            >
              {{ confirmModal.confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- Edit Integration Modal -->
    <transition name="fade">
      <div v-if="editModal.visible" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-slate-900/50" @click="closeEditModal"></div>
        <div class="relative bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl mx-4 p-6 max-h-[90vh] flex flex-col">
          <div class="flex items-start justify-between">
            <h3 class="text-lg font-semibold text-slate-900">Editar integração</h3>
            <button
              type="button"
              @click="closeEditModal"
              class="text-slate-400 hover:text-slate-600"
              aria-label="Fechar"
            >
              ✕
            </button>
          </div>
          <form class="mt-4 space-y-4 overflow-y-auto pr-1" @submit.prevent="saveEditIntegration">
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">Nome da integração</label>
              <input
                v-model="editModal.form.name"
                type="text"
                required
                class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">Memória (MB)</label>
              <input
                v-model.number="editModal.form.memoryMb"
                type="number"
                min="128"
                step="64"
                required
                class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">Exibir custos no painel</label>
              <label class="flex items-center justify-between px-4 py-2.5 border border-slate-300 rounded-lg bg-white">
                <span class="text-sm text-slate-600">Mostrar custo estimado</span>
                <input
                  v-model="editModal.form.showCostEstimate"
                  type="checkbox"
                  class="h-4 w-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                />
              </label>
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">Empresa</label>
              <select
                v-model="editModal.form.companyId"
                @change="editModal.form.processIds = []"
                required
                class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
              >
                <option value="">Selecione uma empresa</option>
                <option v-for="company in companies" :key="company.id" :value="company.id">
                  {{ company.name }}
                </option>
              </select>
            </div>
            <div class="rounded-lg border border-slate-200 p-4">
              <h4 class="text-sm font-semibold text-slate-900">Processos relacionados</h4>
              <p class="mt-1 text-xs text-slate-500">O cliente verá estas automações dentro dos detalhes de cada processo.</p>
              <div v-if="editIntegrationProcessOptions.length" class="mt-3 space-y-2">
                <label v-for="process in editIntegrationProcessOptions" :key="process.id" class="flex items-start gap-3 rounded-md border border-slate-200 px-3 py-2.5 hover:bg-slate-50">
                  <input v-model="editModal.form.processIds" type="checkbox" :value="process.id" class="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600" />
                  <span class="min-w-0">
                    <span class="block truncate text-sm font-medium text-slate-800">{{ process.title }}</span>
                    <span class="text-xs text-slate-500">{{ getProcessStatusLabel(process.status) }}</span>
                  </span>
                </label>
              </div>
              <p v-else class="mt-3 text-sm text-slate-500">Nenhum processo cadastrado para esta empresa.</p>

              <label class="mt-4 flex items-center gap-2 border-t border-slate-200 pt-4 text-sm font-medium text-slate-700">
                <input v-model="editModal.form.createProcess.enabled" type="checkbox" class="h-4 w-4 rounded border-slate-300 text-indigo-600" />
                Criar outro processo vinculado
              </label>
              <div v-if="editModal.form.createProcess.enabled" class="mt-3 grid gap-3 md:grid-cols-2">
                <input v-model="editModal.form.createProcess.title" maxlength="160" :placeholder="`Implantação: ${editModal.form.name}`" class="rounded-md border border-slate-300 px-3 py-2.5 text-sm" />
                <select v-model="editModal.form.createProcess.status" class="rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm">
                  <option value="analysis">Em análise</option><option value="queued">Na fila</option>
                  <option value="in_progress">Em desenvolvimento</option><option value="validation">Em validação</option><option value="delivered">Entregue</option>
                </select>
                <textarea v-model="editModal.form.createProcess.description" rows="2" placeholder="Contexto da entrega (opcional)" class="resize-none rounded-md border border-slate-300 px-3 py-2.5 text-sm md:col-span-2"></textarea>
              </div>
            </div>
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="block text-sm font-medium text-slate-700">Documentações (links)</label>
                <label class="inline-flex items-center text-xs text-slate-600 space-x-2">
                  <input
                    v-model="showEditDocsPreview"
                    type="checkbox"
                    class="h-4 w-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                  />
                  <span>Embed</span>
                </label>
              </div>
              <div class="flex flex-col md:flex-row gap-2">
                <input
                  v-model="editDocumentationLink"
                  type="url"
                  placeholder="https://sua-doc.com/guia"
                  class="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                />
                <button
                  type="button"
                  @click="addEditDocumentationLink"
                  class="inline-flex items-center px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50"
                >
                  Adicionar link
                </button>
              </div>
              <div v-if="editModal.form.documentationLinks?.length" class="mt-3 space-y-2">
                <div
                  v-for="(link, index) in editModal.form.documentationLinks"
                  :key="`${link}-${index}`"
                  class="flex items-center justify-between px-3 py-2 border border-slate-200 rounded-lg text-sm"
                >
                  <span class="truncate">{{ link }}</span>
                  <button
                    type="button"
                    @click="removeEditDocumentationLink(index)"
                    class="text-xs text-red-600 hover:text-red-700"
                  >
                    Remover
                  </button>
                </div>
              </div>
              <div v-if="showEditDocsPreview && editModal.form.documentationLinks?.length" class="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Embed</p>
                <div class="mt-3 space-y-4">
                  <div v-for="(link, index) in editModal.form.documentationLinks" :key="`edit-preview-${index}`" class="space-y-2">
                    <div class="w-full h-40 rounded-lg border border-slate-200 bg-slate-100 overflow-hidden">
                      <iframe
                        :src="link"
                        class="w-full h-full"
                        loading="lazy"
                        referrerpolicy="no-referrer"
                        sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                        title="Documentação"
                      ></iframe>
                    </div>
                    <a
                      :href="link"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700"
                    >
                      Abrir em nova aba
                    </a>
                  </div>
                </div>
              </div>
            </div>
            <div class="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                @click="closeEditModal"
                class="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 border border-slate-300 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                :disabled="editModal.loading"
                class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
              >
                {{ editModal.loading ? 'Salvando...' : 'Salvar alterações' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </transition>

    <!-- Invoke Test Modal -->
    <transition name="fade">
      <div v-if="invokeModal.visible" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-slate-900/50" @click="closeInvokeModal"></div>
        <div class="relative bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl mx-4 p-6 max-h-[90vh] flex flex-col">
          <div class="flex items-start justify-between">
            <div>
              <h3 class="text-lg font-semibold text-slate-900">Invocar função (teste)</h3>
              <p class="mt-1 text-xs text-slate-500">
                {{ invokeModal.integrationName }} — isso executa a função Lambda de verdade. Use com cuidado em funções com efeitos colaterais.
              </p>
            </div>
            <button
              type="button"
              @click="closeInvokeModal"
              class="text-slate-400 hover:text-slate-600"
              aria-label="Fechar"
            >
              ✕
            </button>
          </div>
          <form class="mt-4 space-y-4 overflow-y-auto pr-1" @submit.prevent="submitInvoke">
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">Payload (JSON)</label>
              <textarea
                v-model="invokeModal.payload"
                rows="6"
                placeholder='{ "chave": "valor" }'
                class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-mono"
              ></textarea>
            </div>
            <div class="flex justify-end space-x-3">
              <button
                type="button"
                @click="closeInvokeModal"
                class="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 border border-slate-300 hover:bg-slate-50"
              >
                Fechar
              </button>
              <button
                type="submit"
                :disabled="invokeModal.loading"
                class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
              >
                {{ invokeModal.loading ? 'Invocando...' : 'Invocar' }}
              </button>
            </div>
            <div v-if="invokeModal.result" class="space-y-2">
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Resultado (status {{ invokeModal.result.statusCode }}<span v-if="invokeModal.result.functionError">, erro: {{ invokeModal.result.functionError }}</span>)
              </p>
              <pre class="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700 overflow-auto max-h-40">{{ invokeModal.result.payload }}</pre>
              <details v-if="invokeModal.result.logTail" class="text-xs text-slate-500">
                <summary class="cursor-pointer">Ver logs da execução</summary>
                <pre class="mt-2 bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-auto max-h-40">{{ invokeModal.result.logTail }}</pre>
              </details>
            </div>
            <p v-if="invokeModal.error" class="text-xs text-red-600">{{ invokeModal.error }}</p>
          </form>
        </div>
      </div>
    </transition>

    <!-- Integration Help Modal -->
    <transition name="fade">
      <div v-if="showIntegrationHelp" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-slate-900/50" @click="showIntegrationHelp = false"></div>
        <div class="relative bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl mx-4 p-6 max-h-[90vh] flex flex-col">
          <div class="flex items-start justify-between">
            <h3 class="text-lg font-semibold text-slate-900">Passo a passo da integração</h3>
            <button
              type="button"
              @click="showIntegrationHelp = false"
              class="text-slate-400 hover:text-slate-600"
              aria-label="Fechar"
            >
              ✕
            </button>
          </div>
          <div class="mt-4 space-y-4 text-sm text-slate-600 overflow-y-auto pr-1">
            <ol class="space-y-3 list-decimal list-inside">
              <li>
                No console da AWS, vá em <strong>IAM → Users → Create user</strong> e crie um usuário para integração.
              </li>
              <li>
                Na etapa <strong>Permissions</strong>, escolha <strong>Attach policies directly</strong> e clique em <strong>Create policy</strong>. No editor <strong>JSON</strong>, adicione ações necessárias: <strong>lambda:ListFunctions</strong>, <strong>cloudwatch:GetMetricData</strong>, <strong>logs:FilterLogEvents</strong>, <strong>logs:StartQuery</strong> e <strong>logs:GetQueryResults</strong>. Salve a policy e associe ao usuário.
              </li>
              <li>
                Ao clicar em <strong>Create policy</strong>, a AWS abre uma nova aba. Salve a policy nessa aba, volte para a aba do usuário e clique no <strong>ícone de refresh</strong> na lista de policies para ela aparecer e ser selecionada.
              </li>
              <li>
                Após criar o usuário, selecione o usuário criado, vá em <strong>Security credentials → Create access key</strong>, selecione <strong>Application running on an AWS compute service</strong>, marque o checkbox e avance, opcionalmente crie uma descrição e clique em <strong>Create access key</strong> para gerar o <strong>Access key ID</strong> e <strong>Secret access key</strong> copie e faça o download (o secret é exibido apenas uma vez).
              </li>
              <li>
                No console do <strong>AWS Lambda</strong>, copie o <strong>Function name</strong>, a <strong>Region</strong> e a <strong>Memory size</strong> configurada da função.
              </li>
              <li>
                Preencha o formulário da integração no sistema e clique em <strong>Adicionar integração</strong>.
              </li>
              <li>
                Por fim, clique em <strong>Testar</strong> para validar a conexão com a função e as permissões.
              </li>
            </ol>
            <div>
              <div class="flex items-center justify-between mb-2">
                <h4 class="text-sm font-semibold text-slate-900">JSON da Policy (copiar e colar)</h4>
                <button
                  type="button"
                  @click="copyIntegrationPolicyJson"
                  class="inline-flex items-center px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors"
                >
                  Copiar JSON
                </button>
              </div>
              <pre class="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700 overflow-auto">{{ integrationPolicyJson }}</pre>
              <p class="mt-2 text-xs text-slate-500">
                Dica: você pode restringir <strong>Resource</strong> por conta/região depois, mas para começar use “*”.
              </p>
            </div>
          </div>
          <div class="mt-6 flex justify-end">
            <button
              type="button"
              @click="showIntegrationHelp = false"
              class="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 border border-slate-300 hover:bg-slate-50"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </transition>
    <!-- MCP Token Modal -->
    <transition name="fade">
      <div v-if="mcpTokenModal" class="fixed inset-0 z-[60] flex items-center justify-center">
        <div class="absolute inset-0 bg-slate-900/50" @click="mcpTokenModal = false"></div>
        <div class="relative bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg mx-4 p-6">
          <div class="flex items-start justify-between mb-4">
            <h3 class="text-lg font-semibold text-slate-900">Chave MCP Gerada</h3>
            <button type="button" @click="mcpTokenModal = false" class="text-slate-400 hover:text-slate-600">✕</button>
          </div>
          <div class="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p class="text-sm text-amber-800 font-medium">Importante: Copie esta chave agora!</p>
            <p class="text-xs text-amber-700 mt-1">Por segurança, não será possível visualizá-la novamente.</p>
          </div>
          <div class="flex items-center gap-2 mb-6">
            <input type="text" readonly :value="generatedTokenData?.token" class="w-full px-4 py-2 border border-slate-300 rounded-lg font-mono text-sm bg-slate-50 text-slate-900" />
            <button @click="copyMcpTokenToClipboard" class="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800">Copiar</button>
          </div>
          <p class="text-sm text-slate-600 mb-2">Para configurar o Cursor (ou outro agente MCP):</p>
          <pre class="bg-slate-900 text-slate-300 p-4 rounded-lg text-xs overflow-x-auto"><code>{
  "mcpServers": {
    "lambda-pulse": {
      "command": "node",
      "args": ["caminho/para/mcp-client.js"],
      "env": {
        "MCP_TOKEN": "{{ generatedTokenData?.token }}"
      }
    }
  }
}</code></pre>
          <div class="mt-6 flex justify-end">
            <button @click="mcpTokenModal = false" class="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200">Fechar</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- MCP Permissions Modal -->
    <transition name="fade">
      <div v-if="mcpPermissionsModal" class="fixed inset-0 z-[60] flex items-center justify-center">
        <div class="absolute inset-0 bg-slate-900/50" @click="mcpPermissionsModal = false"></div>
        <div class="relative bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md mx-4 p-6">
          <div class="flex items-start justify-between mb-4">
            <h3 class="text-lg font-semibold text-slate-900">Permissões MCP</h3>
            <button type="button" @click="mcpPermissionsModal = false" class="text-slate-400 hover:text-slate-600">✕</button>
          </div>
          <p class="text-sm text-slate-500 mb-6">Configure quais dados a empresa <strong>{{ editingMcpCompany?.companyName }}</strong> pode acessar via agentes de IA.</p>
          
          <div class="space-y-4">
            <label class="flex items-center p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
              <input type="checkbox" v-model="mcpPermissionsForm.logs" class="h-4 w-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500">
              <span class="ml-3 text-sm text-slate-700 font-medium">Logs e Métricas de Integrações</span>
            </label>
            <label class="flex items-center p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
              <input type="checkbox" v-model="mcpPermissionsForm.processes" class="h-4 w-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500">
              <span class="ml-3 text-sm text-slate-700 font-medium">Processos e Documentos</span>
            </label>
            <label class="flex items-center p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
              <input type="checkbox" v-model="mcpPermissionsForm.mappings" class="h-4 w-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500">
              <span class="ml-3 text-sm text-slate-700 font-medium">Mapeamentos de Dados</span>
            </label>
            <label class="flex items-center p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
              <input type="checkbox" v-model="mcpPermissionsForm.integrations" class="h-4 w-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500">
              <span class="ml-3 text-sm text-slate-700 font-medium">Listar Integrações / Funções</span>
            </label>
          </div>
          
          <div class="mt-6 flex justify-end gap-3">
            <button @click="mcpPermissionsModal = false" class="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">Cancelar</button>
            <button @click="saveMcpPermissions" class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Salvar Permissões</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- MCP Audit Modal -->
    <transition name="fade">
      <div v-if="mcpAuditModal" class="fixed inset-0 z-[60] flex items-center justify-center">
        <div class="absolute inset-0 bg-slate-900/50" @click="mcpAuditModal = false"></div>
        <div class="relative bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-3xl mx-4 p-6 max-h-[90vh] flex flex-col">
          <div class="flex items-start justify-between mb-4">
            <div>
              <h3 class="text-lg font-semibold text-slate-900">Logs de Uso MCP</h3>
              <p class="text-sm text-slate-500 mt-1">Empresa: {{ mcpAuditCompany?.companyName }}</p>
            </div>
            <button type="button" @click="mcpAuditModal = false" class="text-slate-400 hover:text-slate-600">✕</button>
          </div>
          
          <div class="overflow-y-auto flex-1 pr-1 border border-slate-200 rounded-lg">
            <table class="min-w-full divide-y divide-slate-200">
              <thead class="bg-slate-50 sticky top-0">
                <tr>
                  <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Data/Hora</th>
                  <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Método MCP</th>
                  <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                  <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Duração (ms)</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-slate-200">
                <tr v-for="log in mcpAuditLogs" :key="log.id" class="hover:bg-slate-50">
                  <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-500">{{ new Date(log.created_at).toLocaleString('pt-BR') }}</td>
                  <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-slate-900">{{ log.method }}</td>
                  <td class="px-4 py-3 whitespace-nowrap text-sm">
                    <span :class="['px-2 inline-flex text-xs leading-5 font-semibold rounded-full', log.status === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800']">
                      {{ log.status }}
                    </span>
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-500">{{ log.duration_ms }}</td>
                </tr>
                <tr v-if="mcpAuditLogs.length === 0">
                  <td colspan="4" class="px-4 py-8 text-center text-sm text-slate-500">Nenhum log registrado recentemente.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="mt-6 flex justify-end">
            <button @click="mcpAuditModal = false" class="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200">Fechar</button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { useApi } from '@/composables/useApi'
import type { ClientUser, Integration, AuditLog, Company, ProcessItem, ProcessStatus, CompanyMcpConfig, McpAllowedDomains, McpCompaniesResponse, McpTokenResponse } from '@/types'
import logoDark from '@/assets/logos/logo-dark.svg'
import AdminProcessManager from '@/components/AdminProcessManager.vue'
import MappingWorkspace from '@/components/MappingWorkspace.vue'

const auth = useAuthStore()
const router = useRouter()
const api = useApi()

const activeTab = ref<'integrations' | 'processes' | 'mappings' | 'clients' | 'audit' | 'mcp'>('integrations')
const adminPageTitle = computed(() => ({
  integrations: 'Integrações Lambda',
  processes: 'Processos',
  mappings: 'Mapeamentos',
  clients: 'Clientes e empresas',
  audit: 'Auditoria',
  mcp: 'Acesso MCP e Agentes de IA'
}[activeTab.value]))
const adminPageDescription = computed(() => ({
  integrations: 'Configure funções AWS Lambda e acompanhe a saúde das automações.',
  processes: 'Priorize demandas, planeje etapas e conduza cada entrega com contexto.',
  mappings: 'Crie, importe, versione e publique os de-paras de cada integração.',
  clients: 'Gerencie empresas e as pessoas com acesso ao Lambda Pulse.',
  audit: 'Consulte as alterações administrativas e eventos relevantes do portal.',
  mcp: 'Ative, configure chaves de API e permissões de acesso ao protocolo MCP por empresa.'
}[activeTab.value]))

// Estado da Aba MCP
const mcpLoading = ref(false)
const mcpCompanies = ref<CompanyMcpConfig[]>([])
const mcpStats = ref({ activeCompaniesCount: 0, totalMcpCalls: 0 })
const mcpSearch = ref('')
const mcpTokenModal = ref(false)
const generatedTokenData = ref<McpTokenResponse | null>(null)
const mcpPermissionsModal = ref(false)
const editingMcpCompany = ref<CompanyMcpConfig | null>(null)
const mcpPermissionsForm = ref<McpAllowedDomains>({ logs: true, processes: true, mappings: true, integrations: true })
const mcpAuditModal = ref(false)
const mcpAuditCompany = ref<CompanyMcpConfig | null>(null)
const mcpAuditLogs = ref<any[]>([])

const windowLocationHost = computed(() => typeof window !== 'undefined' ? window.location.host : 'localhost:3000')

const filteredMcpCompanies = computed(() => {
  const search = mcpSearch.value.trim().toLowerCase()
  if (!search) return mcpCompanies.value
  return mcpCompanies.value.filter(c => 
    c.companyName.toLowerCase().includes(search) || 
    (c.apiKeyPrefix && c.apiKeyPrefix.toLowerCase().includes(search))
  )
})

const fetchMcpCompanies = async () => {
  mcpLoading.value = true
  try {
    const res = await api.get<McpCompaniesResponse>('/auth/admin/mcp/companies')
    mcpCompanies.value = res.companies
    mcpStats.value = res.stats
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : 'Falha ao carregar configurações MCP')
  } finally {
    mcpLoading.value = false
  }
}

const toggleMcpStatus = async (company: CompanyMcpConfig) => {
  try {
    const newStatus = !company.isEnabled
    await api.post(`/auth/admin/mcp/company/${company.companyId}/toggle`, { isEnabled: newStatus })
    company.isEnabled = newStatus
    showToast('success', `Acesso MCP ${newStatus ? 'ativado' : 'desativado'} para ${company.companyName}`)
    await fetchMcpCompanies()
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : 'Falha ao alterar status MCP')
  }
}

const generateMcpToken = async (company: CompanyMcpConfig) => {
  const confirmed = await requestConfirm({
    title: 'Gerar/Rotacionar Chave MCP',
    message: company.hasToken 
      ? `Deseja rotacionar a chave de ${company.companyName}? A chave antiga será invalidada imediatamente.`
      : `Gerar nova chave MCP para ${company.companyName}?`,
    confirmLabel: 'Gerar Chave'
  })
  if (!confirmed) return

  try {
    const res = await api.post<McpTokenResponse>(`/auth/admin/mcp/company/${company.companyId}/token`)
    generatedTokenData.value = res
    mcpTokenModal.value = true
    await fetchMcpCompanies()
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : 'Falha ao gerar token MCP')
  }
}

const copyMcpTokenToClipboard = async () => {
  if (!generatedTokenData.value?.token) return
  try {
    await navigator.clipboard.writeText(generatedTokenData.value.token)
    showToast('success', 'Token MCP copiado com sucesso!')
  } catch {
    showToast('error', 'Erro ao copiar o token')
  }
}

const openMcpPermissionsModal = (company: CompanyMcpConfig) => {
  editingMcpCompany.value = company
  mcpPermissionsForm.value = {
    logs: company.allowedDomains?.logs ?? true,
    processes: company.allowedDomains?.processes ?? true,
    mappings: company.allowedDomains?.mappings ?? true,
    integrations: company.allowedDomains?.integrations ?? true
  }
  mcpPermissionsModal.value = true
}

const saveMcpPermissions = async () => {
  if (!editingMcpCompany.value) return
  try {
    await api.put(`/auth/admin/mcp/company/${editingMcpCompany.value.companyId}/permissions`, {
      allowedDomains: mcpPermissionsForm.value
    })
    showToast('success', 'Permissões MCP atualizadas')
    mcpPermissionsModal.value = false
    await fetchMcpCompanies()
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : 'Falha ao salvar permissões')
  }
}

const openMcpAuditModal = async (company: CompanyMcpConfig) => {
  mcpAuditCompany.value = company
  mcpAuditLogs.value = []
  mcpAuditModal.value = true
  try {
    const res = await api.get<{ logs: any[] }>(`/auth/admin/mcp/company/${company.companyId}/audit`)
    mcpAuditLogs.value = res.logs
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : 'Falha ao carregar auditoria MCP')
  }
}

watch(activeTab, (newTab) => {
  if (newTab === 'mcp') {
    fetchMcpCompanies()
  }
})

const adminMappingIntegrationId = ref('')
const auditSearch = ref('')
const auditCompanyFilter = ref('')
const integrationSearch = ref('')
const integrationCreateModal = ref(false)
const companyCreateModal = ref(false)
const clientCreateModal = ref(false)
const integrations = ref<Integration[]>([])
const clients = ref<ClientUser[]>([])
const companies = ref<Company[]>([])
const auditLogs = ref<AuditLog[]>([])
const auditLoading = ref(false)
const auditPagination = ref({ limit: 25, offset: 0, total: 0, returned: 0, hasMore: false })
const processOptions = ref<ProcessItem[]>([])
const adminMappingProcessOptions = computed(() => {
  const integration = integrations.value.find(item => String(item.id) === adminMappingIntegrationId.value)
  if (!integration?.companyId) return []
  return processOptions.value
    .filter(process => process.companyId === integration.companyId && !process.archivedAt)
    .map(process => ({ id: process.id, referenceCode: process.referenceCode, title: process.title }))
})

const integrationLoading = ref(false)
const clientLoading = ref(false)
const companyLoading = ref(false)
const testingId = ref<number | null>(null)

const newIntegration = ref({
  name: '',
  functionName: '',
  region: 'us-east-2',
  memoryMb: 128,
  showCostEstimate: true,
  documentationLinks: [] as string[],
  processIds: [] as number[],
  createProcess: {
    enabled: false,
    title: '',
    description: '',
    status: 'in_progress'
  },
  companyId: null as number | null,
  accessKeyId: '',
  secretAccessKey: ''
})

const newClient = ref({
  email: '',
  password: '',
  companyId: '',
  companyName: ''
})

const createNewCompany = ref(false)
const transferSelection = ref<Record<number, string>>({})
const newCompanyName = ref('')

const defaultCompanyId = computed(() => auth.user?.companyId ?? null)
const filteredIntegrations = computed(() => {
  const search = integrationSearch.value.trim().toLocaleLowerCase('pt-BR')
  if (!search) return integrations.value
  return integrations.value.filter(integration =>
    [integration.name, integration.functionName, integration.region, integration.companyName]
      .some(value => value?.toLocaleLowerCase('pt-BR').includes(search))
  )
})

interface Toast {
  id: number
  type: 'success' | 'error'
  message: string
}

interface ConfirmModalState {
  visible: boolean
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
}

interface EditIntegrationForm {
  id: number | null
  name: string
  memoryMb: number
  showCostEstimate: boolean
  companyId: number | null
  documentationLinks?: string[]
  processIds: number[]
  createProcess: {
    enabled: boolean
    title: string
    description: string
    status: string
  }
}

const toasts = ref<Toast[]>([])
let toastId = 0

const confirmModal = ref<ConfirmModalState>({
  visible: false,
  title: 'Confirmar ação',
  message: '',
  confirmLabel: 'Confirmar',
  cancelLabel: 'Cancelar'
})

const editModal = ref({
  visible: false,
  loading: false,
  form: {
    id: null,
    name: '',
    memoryMb: 128,
    showCostEstimate: true,
    companyId: null,
    processIds: [],
    createProcess: { enabled: false, title: '', description: '', status: 'in_progress' }
  } as EditIntegrationForm
})

const showIntegrationHelp = ref(false)
const showDocsPreview = ref(false)
const newDocumentationLink = ref('')
const editDocumentationLink = ref('')
const showEditDocsPreview = ref(false)
const newIntegrationProcessOptions = computed(() =>
  processOptions.value.filter(process => process.companyId === Number(newIntegration.value.companyId))
)
const editIntegrationProcessOptions = computed(() =>
  processOptions.value.filter(process => process.companyId === Number(editModal.value.form.companyId))
)
const getProcessStatusLabel = (status: ProcessStatus) => ({
  requested: 'Recebida',
  analysis: 'Em análise',
  queued: 'Na fila',
  in_progress: 'Em desenvolvimento',
  validation: 'Em validação',
  delivered: 'Entregue',
  paused: 'Pausada',
  cancelled: 'Cancelada'
}[status])

const integrationPolicyJson = `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "LambdaMonitoringReadOnly",
      "Effect": "Allow",
      "Action": [
        "lambda:ListFunctions",
        "cloudwatch:GetMetricData",
        "logs:FilterLogEvents",
        "logs:StartQuery",
        "logs:GetQueryResults"
      ],
      "Resource": "*"
    }
  ]
}`

let confirmResolver: ((value: boolean) => void) | null = null

const showToast = (type: 'success' | 'error', message: string) => {
  const id = ++toastId
  toasts.value.push({ id, type, message })
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }, 4000)
}

const copyIntegrationPolicyJson = async () => {
  try {
    await navigator.clipboard.writeText(integrationPolicyJson)
    showToast('success', 'JSON copiado para a área de transferência')
  } catch {
    showToast('error', 'Não foi possível copiar o JSON')
  }
}

const addDocumentationLink = () => {
  const link = newDocumentationLink.value.trim()
  if (!link) {
    showToast('error', 'Informe um link válido')
    return
  }

  try {
    const parsed = new URL(link)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      showToast('error', 'Use links http ou https')
      return
    }
  } catch {
    showToast('error', 'Link inválido')
    return
  }

  if (newIntegration.value.documentationLinks.includes(link)) {
    showToast('error', 'Este link já foi adicionado')
    return
  }

  newIntegration.value.documentationLinks.push(link)
  newDocumentationLink.value = ''
}

const removeDocumentationLink = (index: number) => {
  newIntegration.value.documentationLinks.splice(index, 1)
}

const addEditDocumentationLink = () => {
  const link = editDocumentationLink.value.trim()
  if (!link) {
    showToast('error', 'Informe um link válido')
    return
  }

  try {
    const parsed = new URL(link)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      showToast('error', 'Use links http ou https')
      return
    }
  } catch {
    showToast('error', 'Link inválido')
    return
  }

  if (editModal.value.form.documentationLinks?.includes(link)) {
    showToast('error', 'Este link já foi adicionado')
    return
  }

  if (!editModal.value.form.documentationLinks) {
    editModal.value.form.documentationLinks = []
  }

  editModal.value.form.documentationLinks.push(link)
  editDocumentationLink.value = ''
}

const removeEditDocumentationLink = (index: number) => {
  editModal.value.form.documentationLinks?.splice(index, 1)
}

const requestConfirm = (options: { title?: string; message: string; confirmLabel?: string; cancelLabel?: string }) => {
  confirmModal.value = {
    visible: true,
    title: options.title || 'Confirmar ação',
    message: options.message,
    confirmLabel: options.confirmLabel || 'Confirmar',
    cancelLabel: options.cancelLabel || 'Cancelar'
  }

  return new Promise<boolean>((resolve) => {
    confirmResolver = resolve
  })
}

const closeConfirmModal = () => {
  confirmModal.value.visible = false
  confirmResolver = null
}

const handleModalConfirm = () => {
  if (confirmResolver) {
    confirmResolver(true)
  }
  closeConfirmModal()
}

const handleModalCancel = () => {
  if (confirmResolver) {
    confirmResolver(false)
  }
  closeConfirmModal()
}

const fetchIntegrations = async () => {
  try {
    const data = await api.get<{ integrations: Integration[] }>('/lambda/integrations')
    integrations.value = data.integrations
    if (!adminMappingIntegrationId.value && data.integrations[0]) {
      adminMappingIntegrationId.value = String(data.integrations[0].id)
    }
  } catch (error) {
    console.error('Falha ao buscar integrações:', error)
  }
}

const fetchClients = async () => {
  try {
    const data = await api.get<{ clients: ClientUser[] }>('/auth/clients?scope=all')
    clients.value = data.clients

    const selection = { ...transferSelection.value }
    clients.value.forEach(client => {
      selection[client.id] = String(client.companyId)
    })
    transferSelection.value = selection
  } catch (error) {
    console.error('Falha ao buscar clientes:', error)
  }
}

const fetchCompanies = async () => {
  try {
    const data = await api.get<{ companies: Company[] }>('/auth/companies')
    companies.value = data.companies

    if (!newIntegration.value.companyId && defaultCompanyId.value) {
      newIntegration.value.companyId = defaultCompanyId.value
    }

    if (!createNewCompany.value && !newClient.value.companyId && auth.user?.companyId) {
      newClient.value.companyId = String(auth.user.companyId)
    }
  } catch (error) {
    console.error('Falha ao buscar empresas:', error)
  }
}

const fetchProcesses = async () => {
  try {
    const data = await api.get<{ processes: ProcessItem[] }>('/processes')
    processOptions.value = data.processes
  } catch (error) {
    console.error('Falha ao buscar processos:', error)
  }
}

const fetchAuditLogs = async () => {
  auditLoading.value = true
  try {
    const params = new URLSearchParams({
      limit: String(auditPagination.value.limit),
      offset: String(auditPagination.value.offset)
    })
    if (auditSearch.value.trim()) params.set('search', auditSearch.value.trim())
    if (auditCompanyFilter.value) params.set('companyId', auditCompanyFilter.value)
    const data = await api.get<{ logs: AuditLog[], pagination: typeof auditPagination.value }>(`/audit/logs?${params}`)
    auditLogs.value = data.logs
    auditPagination.value = data.pagination
  } catch (error) {
    console.error('Falha ao buscar logs de auditoria:', error)
  } finally {
    auditLoading.value = false
  }
}
const resetAuditPagination = () => {
  auditPagination.value.offset = 0
  void fetchAuditLogs()
}
const changeAuditPage = (direction: -1 | 1) => {
  auditPagination.value.offset = Math.max(0, auditPagination.value.offset + direction * auditPagination.value.limit)
  void fetchAuditLogs()
}

const addIntegration = async () => {
  integrationLoading.value = true
  try {
    await api.post('/lambda/integrations', {
      ...newIntegration.value,
      companyId: newIntegration.value.companyId ? Number(newIntegration.value.companyId) : defaultCompanyId.value,
      memoryMb: Number(newIntegration.value.memoryMb) || 128,
      showCostEstimate: Boolean(newIntegration.value.showCostEstimate),
      documentationLinks: newIntegration.value.documentationLinks
    })

    showToast('success', 'Integração adicionada com sucesso')
    newIntegration.value = {
      name: '',
      functionName: '',
      region: 'us-east-2',
      memoryMb: 128,
      showCostEstimate: true,
      documentationLinks: [],
      processIds: [],
      createProcess: { enabled: false, title: '', description: '', status: 'in_progress' },
      companyId: defaultCompanyId.value,
      accessKeyId: '',
      secretAccessKey: ''
    }
    newDocumentationLink.value = ''
    showDocsPreview.value = false
    integrationCreateModal.value = false
    await Promise.all([fetchIntegrations(), fetchProcesses()])
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : 'Falha ao adicionar integração')
  } finally {
    integrationLoading.value = false
  }
}

const testIntegration = async (integration: Integration) => {
  testingId.value = integration.id
  try {
    const result = await api.post<{ status: string; message: string }>(`/lambda/integrations/${integration.id}/health-check`)
    showToast(result.status === 'healthy' ? 'success' : 'error', result.message)
    await fetchIntegrations()
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : `O teste da integração "${integration.name}" falhou.`)
  } finally {
    testingId.value = null
  }
}

interface InvokeResult {
  statusCode: number
  functionError: string | null
  payload: string | null
  logTail: string | null
}

const invokeModal = ref<{
  visible: boolean
  integrationId: number | null
  integrationName: string
  payload: string
  loading: boolean
  result: InvokeResult | null
  error: string | null
}>({
  visible: false,
  integrationId: null,
  integrationName: '',
  payload: '{}',
  loading: false,
  result: null,
  error: null
})

const openInvokeModal = (integration: Integration) => {
  invokeModal.value = {
    visible: true,
    integrationId: integration.id,
    integrationName: `${integration.name} (${integration.functionName})`,
    payload: '{}',
    loading: false,
    result: null,
    error: null
  }
}

const closeInvokeModal = () => {
  invokeModal.value.visible = false
}

const submitInvoke = async () => {
  if (!invokeModal.value.integrationId) return

  let parsedPayload: unknown = {}
  try {
    parsedPayload = invokeModal.value.payload.trim() ? JSON.parse(invokeModal.value.payload) : {}
  } catch {
    invokeModal.value.error = 'Payload precisa ser um JSON válido'
    return
  }

  invokeModal.value.loading = true
  invokeModal.value.error = null
  invokeModal.value.result = null

  try {
    const data = await api.post<InvokeResult>(`/lambda/invoke/${invokeModal.value.integrationId}`, {
      payload: parsedPayload
    })
    invokeModal.value.result = data
  } catch (error) {
    invokeModal.value.error = error instanceof Error ? error.message : 'Falha ao invocar a função'
  } finally {
    invokeModal.value.loading = false
  }
}

const deleteIntegration = async (integration: Integration) => {
  const confirmed = await requestConfirm({
    title: 'Excluir integração',
    message: `Tem certeza que deseja excluir "${integration.name}"? Esta ação não pode ser desfeita.`,
    confirmLabel: 'Excluir'
  })
  if (!confirmed) {
    return
  }

  try {
    await api.del(`/lambda/integrations/${integration.id}`)
    showToast('success', 'Integração excluída com sucesso')
    integrations.value = integrations.value.filter(i => i.id !== integration.id)
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : 'Falha ao excluir integração')
  }
}

const openEditIntegration = (integration: Integration) => {
  editModal.value.visible = true
  editModal.value.form = {
    id: integration.id,
    name: integration.name,
    memoryMb: integration.memoryMb || 128,
    showCostEstimate: integration.showCostEstimate !== false,
    companyId: integration.companyId ?? null,
    documentationLinks: integration.documentationLinks ? [...integration.documentationLinks] : [],
    processIds: integration.processes?.map(process => process.id) || [],
    createProcess: { enabled: false, title: '', description: '', status: 'in_progress' }
  }
}

const closeEditModal = () => {
  editModal.value.visible = false
  editModal.value.loading = false
  editModal.value.form = {
    id: null,
    name: '',
    memoryMb: 128,
    showCostEstimate: true,
    companyId: null,
    documentationLinks: [],
    processIds: [],
    createProcess: { enabled: false, title: '', description: '', status: 'in_progress' }
  }
  editDocumentationLink.value = ''
  showEditDocsPreview.value = false
}

const saveEditIntegration = async () => {
  if (!editModal.value.form.id) return
  editModal.value.loading = true
  try {
    await api.patch(`/lambda/integrations/${editModal.value.form.id}`, {
      name: editModal.value.form.name,
      memoryMb: Number(editModal.value.form.memoryMb) || 128,
      showCostEstimate: Boolean(editModal.value.form.showCostEstimate),
      companyId: editModal.value.form.companyId,
      documentationLinks: editModal.value.form.documentationLinks,
      processIds: editModal.value.form.processIds,
      createProcess: editModal.value.form.createProcess
    })

    showToast('success', 'Integração atualizada com sucesso')
    await Promise.all([fetchIntegrations(), fetchProcesses()])
    closeEditModal()
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : 'Falha ao atualizar integração')
  } finally {
    editModal.value.loading = false
  }
}

const addClient = async () => {
  clientLoading.value = true
  try {
    if (createNewCompany.value) {
      if (!newClient.value.companyName.trim()) {
        showToast('error', 'Informe o nome da empresa')
        return
      }
    } else if (!newClient.value.companyId) {
      showToast('error', 'Selecione uma empresa')
      return
    }

    const payload: Record<string, unknown> = {
      email: newClient.value.email,
      password: newClient.value.password
    }

    if (createNewCompany.value) {
      payload.companyName = newClient.value.companyName.trim()
    } else {
      payload.companyId = Number(newClient.value.companyId)
    }

    await api.post('/auth/clients', payload)
    showToast('success', 'Cliente criado com sucesso')
    newClient.value = { email: '', password: '', companyId: '', companyName: '' }
    createNewCompany.value = false
    clientCreateModal.value = false
    await fetchCompanies()
    await fetchClients()
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : 'Falha ao criar cliente')
  } finally {
    clientLoading.value = false
  }
}

const addCompany = async () => {
  companyLoading.value = true
  try {
    const trimmedName = newCompanyName.value.trim()
    if (!trimmedName) {
      showToast('error', 'Informe o nome da empresa')
      return
    }

    await api.post('/auth/companies', { name: trimmedName })
    showToast('success', 'Empresa criada com sucesso')
    newCompanyName.value = ''
    companyCreateModal.value = false
    await fetchCompanies()
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : 'Falha ao criar empresa')
  } finally {
    companyLoading.value = false
  }
}

const toggleClientStatus = async (client: ClientUser) => {
  const action = client.isActive ? 'inativar' : 'ativar'
  const confirmed = await requestConfirm({
    title: 'Alterar status do cliente',
    message: `Tem certeza que deseja ${action} ${client.email}?`,
    confirmLabel: action === 'ativar' ? 'Ativar' : 'Inativar'
  })
  if (!confirmed) {
    return
  }

  try {
    await api.patch(`/auth/clients/${client.id}/status`, { isActive: !client.isActive })
    showToast('success', `Cliente ${action === 'ativar' ? 'ativado' : 'inativado'} com sucesso`)
    await fetchClients()
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : `Falha ao ${action} cliente`)
  }
}

const deleteClient = async (client: ClientUser) => {
  const confirmed = await requestConfirm({
    title: 'Excluir cliente',
    message: `Excluir ${client.email}? Esta ação não pode ser desfeita.`,
    confirmLabel: 'Excluir'
  })
  if (!confirmed) {
    return
  }

  try {
    await api.del(`/auth/clients/${client.id}`)
    showToast('success', 'Cliente excluído com sucesso')
    await fetchClients()
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : 'Falha ao excluir cliente')
  }
}

const transferClientCompany = async (client: ClientUser) => {
  const selectedCompanyId = transferSelection.value[client.id]

  if (!selectedCompanyId) {
    showToast('error', 'Selecione uma empresa')
    return
  }

  if (Number(selectedCompanyId) === client.companyId) {
    showToast('error', 'Cliente já está nesta empresa')
    return
  }

  const confirmed = await requestConfirm({
    title: 'Transferir cliente',
    message: `Transferir ${client.email} para outra empresa?`,
    confirmLabel: 'Transferir'
  })
  if (!confirmed) {
    return
  }

  try {
    await api.patch(`/auth/clients/${client.id}/company`, { companyId: Number(selectedCompanyId) })
    showToast('success', 'Cliente transferido com sucesso')
    await fetchClients()
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : 'Falha ao transferir cliente')
  }
}

const resendInvite = async (client: ClientUser) => {
  const confirmed = await requestConfirm({
    title: 'Reenviar convite',
    message: `Reenviar convite por e-mail para ${client.email}?`,
    confirmLabel: 'Reenviar'
  })
  if (!confirmed) {
    return
  }

  try {
    await api.post(`/auth/clients/${client.id}/invite`)
    showToast('success', 'Convite enviado por e-mail')
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : 'Falha ao enviar convite')
  }
}

const getCompanyIntegrationCount = (companyId: number): number => {
  return integrations.value.filter(i => i.companyId === companyId).length
}

const getActionClass = (action: string): string => {
  if (action.includes('create') || action.includes('login')) {
    return 'bg-emerald-100 text-emerald-800'
  }
  if (action.includes('delete') || action.includes('logout')) {
    return 'bg-red-100 text-red-800'
  }
  if (action.includes('update') || action.includes('refresh')) {
    return 'bg-blue-100 text-blue-800'
  }
  return 'bg-slate-100 text-slate-800'
}

const handleLogout = async () => {
  await auth.logout()
  router.push('/login')
}

onMounted(async () => {
  if (!auth.isAuthenticated || !auth.isAdmin) {
    router.push('/login')
    return
  }
  await Promise.all([
    fetchIntegrations(),
    fetchCompanies(),
    fetchProcesses(),
    fetchClients(),
    fetchAuditLogs()
  ])
})
</script>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(100px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
