<template>
  <div class="min-h-screen bg-slate-50">
    <!-- Navigation -->
    <nav class="bg-white shadow-sm border-b border-slate-200">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between h-16">
          <div class="flex items-center space-x-3">
            <img :src="logoDark" alt="Company logo" class="h-8 w-auto" />
            <div>
              <h1 class="text-lg font-semibold text-slate-900">Admin Panel</h1>
              <p class="text-xs text-slate-500">{{ auth.user?.companyName }}</p>
            </div>
          </div>
          <div class="flex items-center space-x-4">
            <div class="text-right">
              <p class="text-sm font-medium text-slate-900">{{ auth.user?.email }}</p>
              <p class="text-xs text-slate-500">Administrator</p>
            </div>
            <button
              @click="handleLogout"
              class="inline-flex items-center px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>

    <main class="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <!-- Header with Stats -->
      <div class="mb-8">
        <h2 class="text-2xl font-bold text-slate-900">Lambda Integrations</h2>
        <p class="mt-1 text-sm text-slate-600">
          Configure AWS Lambda functions for client monitoring
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
              <p class="text-sm font-medium text-slate-500">Integrations</p>
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
              <p class="text-sm font-medium text-slate-500">Client Users</p>
              <p class="text-2xl font-bold text-slate-900">{{ clients.length }}</p>
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
              <p class="text-sm font-medium text-slate-500">Audit Logs</p>
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
              Integrations
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
              Client Users
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
              Audit Logs
            </button>
          </nav>
        </div>

        <!-- Integrations Tab -->
        <div v-if="activeTab === 'integrations'" class="p-6">
          <!-- Add Integration Form -->
          <div class="bg-slate-50 rounded-xl p-6 mb-8">
            <h3 class="text-lg font-semibold text-slate-900 mb-4">Add New Integration</h3>
            <form @submit.prevent="addIntegration" class="space-y-4">
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label class="block text-sm font-medium text-slate-700 mb-1">Integration Name</label>
                  <input
                    v-model="newIntegration.name"
                    type="text"
                    required
                    placeholder="e.g., Production API"
                    class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-700 mb-1">Function Name</label>
                  <input
                    v-model="newIntegration.functionName"
                    type="text"
                    required
                    placeholder="e.g., my-lambda-function"
                    class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-700 mb-1">AWS Region</label>
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
                  <label class="block text-sm font-medium text-slate-700 mb-1">AWS Access Key ID</label>
                  <input
                    v-model="newIntegration.accessKeyId"
                    type="text"
                    required
                    placeholder="AKIA..."
                    class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-mono"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-700 mb-1">AWS Secret Access Key</label>
                  <input
                    v-model="newIntegration.secretAccessKey"
                    type="password"
                    required
                    placeholder="••••••••"
                    class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-mono"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-700 mb-1">Assign to Client</label>
                  <select
                    v-model="newIntegration.clientId"
                    class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                  >
                    <option value="">No client assigned</option>
                    <option v-for="client in integrationClients" :key="client.id" :value="client.id">
                      {{ client.email }}
                    </option>
                  </select>
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
                  Add Integration
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
                    </p>
                    <p v-if="getClientEmail(integration.clientId)" class="text-xs text-slate-400 mt-1">
                      Assigned to: {{ getClientEmail(integration.clientId) }}
                    </p>
                  </div>
                </div>
                <div class="flex items-center space-x-2">
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
                    Test
                  </button>
                  <button
                    @click="deleteIntegration(integration)"
                    class="inline-flex items-center px-3 py-2 border border-red-300 rounded-lg text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                  >
                    <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="text-center py-12 text-slate-500">
            <svg class="mx-auto h-12 w-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <p class="mt-4 text-sm">No integrations yet. Add your first Lambda integration above.</p>
          </div>
        </div>

        <!-- Clients Tab -->
        <div v-if="activeTab === 'clients'" class="p-6">
          <!-- Add Company Form -->
          <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-8">
            <h3 class="text-lg font-semibold text-slate-900 mb-4">Create Company</h3>
            <form @submit.prevent="addCompany" class="flex flex-col md:flex-row md:items-end gap-4">
              <div class="flex-1">
                <label class="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
                <input
                  v-model="newCompanyName"
                  type="text"
                  required
                  placeholder="e.g., Acme Corp"
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
                Create Company
              </button>
            </form>
          </div>

          <!-- Add Client Form -->
          <div class="bg-slate-50 rounded-xl p-6 mb-8">
            <h3 class="text-lg font-semibold text-slate-900 mb-4">Create Client User</h3>
            <form @submit.prevent="addClient" class="space-y-4">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                  <input
                    v-model="newClient.email"
                    type="email"
                    required
                    placeholder="client@company.com"
                    class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-700 mb-1">Password</label>
                  <input
                    v-model="newClient.password"
                    type="password"
                    required
                    minlength="8"
                    placeholder="Min. 8 characters"
                    class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  />
                </div>
                <div class="md:col-span-2">
                  <div class="flex items-center justify-between mb-2">
                    <label class="block text-sm font-medium text-slate-700">Company</label>
                    <label class="inline-flex items-center text-xs text-slate-500 space-x-2">
                      <input
                        v-model="createNewCompany"
                        type="checkbox"
                        class="h-4 w-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                      />
                      <span>Create new company</span>
                    </label>
                  </div>
                  <select
                    v-if="!createNewCompany"
                    v-model="newClient.companyId"
                    class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                  >
                    <option value="">Select a company</option>
                    <option v-for="company in companies" :key="company.id" :value="company.id">
                      {{ company.name }}
                    </option>
                  </select>
                  <input
                    v-else
                    v-model="newClient.companyName"
                    type="text"
                    placeholder="New company name"
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
                  Create Client
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
                        Client
                      </span>
                      <span
                        :class="client.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'"
                        class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ml-2"
                      >
                        {{ client.isActive ? 'Active' : 'Inactive' }}
                      </span>
                      <span class="mx-2">•</span>
                      <span>{{ getClientIntegrationCount(client.id) }} integration(s)</span>
                    </p>
                    <p class="text-xs text-slate-400 mt-1">Company: {{ client.companyName }}</p>
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
                      Transfer
                    </button>
                  </div>
                  <button
                    @click="resendInvite(client)"
                    class="inline-flex items-center px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                  >
                    <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Resend invite
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
                    {{ client.isActive ? 'Deactivate' : 'Activate' }}
                  </button>
                  <button
                    @click="deleteClient(client)"
                    class="inline-flex items-center px-3 py-2 border border-red-300 rounded-lg text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                  >
                    <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="text-center py-12 text-slate-500">
            <svg class="mx-auto h-12 w-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <p class="mt-4 text-sm">No client users yet. Create your first client above.</p>
          </div>
        </div>

        <!-- Audit Logs Tab -->
        <div v-if="activeTab === 'audit'" class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-slate-900">Recent Activity</h3>
            <button
              @click="fetchAuditLogs"
              class="inline-flex items-center px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>

          <div v-if="auditLogs.length > 0" class="overflow-x-auto">
            <table class="min-w-full">
              <thead class="bg-slate-50">
                <tr>
                  <th class="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Timestamp</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Action</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">User</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Resource</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">IP Address</th>
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
                    {{ log.userId || 'System' }}
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
            <p class="mt-4 text-sm">No audit logs yet.</p>
          </div>
        </div>
      </div>
    </main>

    <!-- Toast Notifications -->
    <div class="fixed bottom-4 right-4 z-50 space-y-2">
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
  region: 'us-east-1',
  accessKeyId: '',
  secretAccessKey: '',
  clientId: ''
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

const integrationClients = computed(() => {
  if (!auth.user?.companyId) return []
  return clients.value.filter(client => client.companyId === auth.user?.companyId)
})

interface Toast {
  id: number
  type: 'success' | 'error'
  message: string
}

const toasts = ref<Toast[]>([])
let toastId = 0

const showToast = (type: 'success' | 'error', message: string) => {
  const id = ++toastId
  toasts.value.push({ id, type, message })
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }, 4000)
}

const fetchIntegrations = async () => {
  try {
    const data = await api.get<{ integrations: Integration[] }>('/lambda/integrations')
    integrations.value = data.integrations
  } catch (error) {
    console.error('Failed to fetch integrations:', error)
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
    console.error('Failed to fetch clients:', error)
  }
}

const fetchCompanies = async () => {
  try {
    const data = await api.get<{ companies: Company[] }>('/auth/companies')
    companies.value = data.companies

    if (!createNewCompany.value && !newClient.value.companyId && auth.user?.companyId) {
      newClient.value.companyId = String(auth.user.companyId)
    }
  } catch (error) {
    console.error('Failed to fetch companies:', error)
  }
}

const fetchAuditLogs = async () => {
  try {
    const data = await api.get<{ logs: AuditLog[] }>('/audit/logs?limit=50')
    auditLogs.value = data.logs
  } catch (error) {
    console.error('Failed to fetch audit logs:', error)
  }
}

const addIntegration = async () => {
  integrationLoading.value = true
  try {
    await api.post('/lambda/integrations', {
      ...newIntegration.value,
      clientId: newIntegration.value.clientId ? Number(newIntegration.value.clientId) : null
    })

    showToast('success', 'Integration added successfully')
    newIntegration.value = {
      name: '',
      functionName: '',
      region: 'us-east-1',
      accessKeyId: '',
      secretAccessKey: '',
      clientId: ''
    }
    await fetchIntegrations()
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : 'Failed to add integration')
  } finally {
    integrationLoading.value = false
  }
}

const testIntegration = async (integration: Integration) => {
  testingId.value = integration.id
  try {
    await api.get(`/lambda/metrics/${integration.id}?days=1`)
    showToast('success', `Integration "${integration.name}" is working correctly!`)
  } catch {
    showToast('error', `Integration "${integration.name}" test failed. Check your credentials.`)
  } finally {
    testingId.value = null
  }
}

const deleteIntegration = async (integration: Integration) => {
  if (!confirm(`Are you sure you want to delete "${integration.name}"? This action cannot be undone.`)) {
    return
  }

  try {
    await api.del(`/lambda/integrations/${integration.id}`)
    showToast('success', 'Integration deleted successfully')
    integrations.value = integrations.value.filter(i => i.id !== integration.id)
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : 'Failed to delete integration')
  }
}

const addClient = async () => {
  clientLoading.value = true
  try {
    if (createNewCompany.value) {
      if (!newClient.value.companyName.trim()) {
        showToast('error', 'Please enter a company name')
        return
      }
    } else if (!newClient.value.companyId) {
      showToast('error', 'Please select a company')
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
    showToast('success', 'Client user created successfully')
    newClient.value = { email: '', password: '', companyId: '', companyName: '' }
    createNewCompany.value = false
    await fetchCompanies()
    await fetchClients()
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : 'Failed to create client')
  } finally {
    clientLoading.value = false
  }
}

const addCompany = async () => {
  companyLoading.value = true
  try {
    const trimmedName = newCompanyName.value.trim()
    if (!trimmedName) {
      showToast('error', 'Please enter a company name')
      return
    }

    await api.post('/auth/companies', { name: trimmedName })
    showToast('success', 'Company created successfully')
    newCompanyName.value = ''
    await fetchCompanies()
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : 'Failed to create company')
  } finally {
    companyLoading.value = false
  }
}

const toggleClientStatus = async (client: ClientUser) => {
  const action = client.isActive ? 'deactivate' : 'activate'
  if (!confirm(`Are you sure you want to ${action} ${client.email}?`)) {
    return
  }

  try {
    await api.patch(`/auth/clients/${client.id}/status`, { isActive: !client.isActive })
    showToast('success', `Client ${action}d successfully`)
    await fetchClients()
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : `Failed to ${action} client`)
  }
}

const deleteClient = async (client: ClientUser) => {
  if (!confirm(`Delete ${client.email}? This action cannot be undone.`)) {
    return
  }

  try {
    await api.del(`/auth/clients/${client.id}`)
    showToast('success', 'Client deleted successfully')
    await fetchClients()
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : 'Failed to delete client')
  }
}

const transferClientCompany = async (client: ClientUser) => {
  const selectedCompanyId = transferSelection.value[client.id]

  if (!selectedCompanyId) {
    showToast('error', 'Please select a company')
    return
  }

  if (Number(selectedCompanyId) === client.companyId) {
    showToast('error', 'Client is already in this company')
    return
  }

  if (!confirm(`Transfer ${client.email} to another company?`)) {
    return
  }

  try {
    await api.patch(`/auth/clients/${client.id}/company`, { companyId: Number(selectedCompanyId) })
    showToast('success', 'Client transferred successfully')
    await fetchClients()
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : 'Failed to transfer client')
  }
}

const resendInvite = async (client: ClientUser) => {
  if (!confirm(`Resend invite email to ${client.email}?`)) {
    return
  }

  try {
    await api.post(`/auth/clients/${client.id}/invite`)
    showToast('success', 'Invite email sent')
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : 'Failed to send invite')
  }
}

const getClientEmail = (clientId: number | null | undefined): string => {
  if (!clientId) return ''
  const client = integrationClients.value.find(c => c.id === clientId)
  return client?.email || ''
}

const getClientIntegrationCount = (clientId: number): number => {
  return integrations.value.filter(i => i.clientId === clientId).length
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
</style>
