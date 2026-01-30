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
        <h2 class="text-2xl font-bold text-slate-900">Integrações Lambda</h2>
        <p class="mt-1 text-sm text-slate-600">
          Configure funções AWS Lambda para monitoramento de clientes
        </p>
      </div>

      <!-- Quick Stats -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
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
        <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
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
        <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div class="flex items-center">
            <div class="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div class="ml-4">
              <p class="text-sm font-medium text-slate-500">Logs de auditoria</p>
              <p class="text-2xl font-bold text-slate-900">{{ auditLogs.length }}</p>
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
          </nav>
        </div>

        <!-- Integrations Tab -->
        <div v-if="activeTab === 'integrations'" class="p-6">
          <!-- Add Integration Form -->
          <div class="bg-slate-50 rounded-xl p-6 mb-8">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold text-slate-900">Adicionar nova integração</h3>
              <button
                type="button"
                @click="showIntegrationHelp = true"
                class="inline-flex items-center px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors"
              >
                Ajuda
              </button>
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
                    required
                    class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                  >
                    <option value="">Selecione uma empresa</option>
                    <option v-for="company in companies" :key="company.id" :value="company.id">
                      {{ company.name }}
                    </option>
                  </select>
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

          <!-- Integrations List -->
          <div v-if="integrations.length > 0" class="space-y-4">
            <div
              v-for="integration in integrations"
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
                    <h4 class="text-base font-semibold text-slate-900">{{ integration.name }}</h4>
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
        <div v-if="activeTab === 'clients'" class="p-6">
          <!-- Add Company Form -->
          <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-8">
            <h3 class="text-lg font-semibold text-slate-900 mb-4">Criar empresa</h3>
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

          <!-- Add Client Form -->
          <div class="bg-slate-50 rounded-xl p-6 mb-8">
            <h3 class="text-lg font-semibold text-slate-900 mb-4">Criar cliente</h3>
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
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-slate-900">Atividade recente</h3>
            <button
              @click="fetchAuditLogs"
              class="inline-flex items-center px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Atualizar
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
                    {{ log.userId || 'Sistema' }}
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
          <div v-else class="text-center py-12 text-slate-500">
            <svg class="mx-auto h-12 w-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p class="mt-4 text-sm">Nenhum log de auditoria ainda.</p>
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
        <div class="relative bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg mx-4 p-6 max-h-[90vh] flex flex-col">
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
                required
                class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
              >
                <option value="">Selecione uma empresa</option>
                <option v-for="company in companies" :key="company.id" :value="company.id">
                  {{ company.name }}
                </option>
              </select>
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { useApi } from '@/composables/useApi'
import type { ClientUser, Integration, AuditLog, Company } from '@/types'
import logoDark from '@/assets/logos/logo-dark.svg'

const auth = useAuthStore()
const router = useRouter()
const api = useApi()

const activeTab = ref<'integrations' | 'clients' | 'audit'>('integrations')
const integrations = ref<Integration[]>([])
const clients = ref<ClientUser[]>([])
const companies = ref<Company[]>([])
const auditLogs = ref<AuditLog[]>([])

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
    companyId: null
  } as EditIntegrationForm
})

const showIntegrationHelp = ref(false)
const showDocsPreview = ref(false)
const newDocumentationLink = ref('')
const editDocumentationLink = ref('')
const showEditDocsPreview = ref(false)

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

const fetchAuditLogs = async () => {
  try {
    const data = await api.get<{ logs: AuditLog[] }>('/audit/logs?limit=50')
    auditLogs.value = data.logs
  } catch (error) {
    console.error('Falha ao buscar logs de auditoria:', error)
  }
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
      companyId: defaultCompanyId.value,
      accessKeyId: '',
      secretAccessKey: ''
    }
    newDocumentationLink.value = ''
    showDocsPreview.value = false
    await fetchIntegrations()
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : 'Falha ao adicionar integração')
  } finally {
    integrationLoading.value = false
  }
}

const testIntegration = async (integration: Integration) => {
  testingId.value = integration.id
  try {
    await api.get(`/lambda/metrics/${integration.id}?days=1`)
    showToast('success', `A integração "${integration.name}" está funcionando corretamente!`)
  } catch {
    showToast('error', `O teste da integração "${integration.name}" falhou. Verifique suas credenciais.`)
  } finally {
    testingId.value = null
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
    documentationLinks: integration.documentationLinks ? [...integration.documentationLinks] : []
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
    documentationLinks: []
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
      documentationLinks: editModal.value.form.documentationLinks
    })

    showToast('success', 'Integração atualizada com sucesso')
    await fetchIntegrations()
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
