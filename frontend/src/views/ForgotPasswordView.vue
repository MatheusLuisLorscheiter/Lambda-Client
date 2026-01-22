<template>
  <div class="min-h-screen flex flex-col bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
    <div class="flex-1 flex items-center justify-center">
      <div class="max-w-md w-full space-y-8 bg-white shadow-2xl rounded-2xl px-8 py-10 mx-4">
      <div class="flex flex-col items-center">
        <img :src="logoDark" alt="Logo da empresa" class="h-14 w-auto" />
        <h2 class="mt-6 text-center text-2xl font-bold text-slate-900">
          Redefinir senha
        </h2>
        <p class="mt-2 text-center text-sm text-slate-500">
          Informe sua empresa e e-mail para receber o link de redefinição
        </p>
      </div>
      <form class="mt-8 space-y-5" @submit.prevent="handleSubmit">
        <div class="space-y-4">
          <div>
            <div class="flex items-center justify-between">
              <label for="company" class="block text-sm font-medium text-slate-700 mb-1">Empresa</label>
              <button
                type="button"
                @click="openCompanyLookup"
                class="text-xs font-medium text-indigo-600 hover:text-indigo-500"
              >
                Esqueci o nome da empresa
              </button>
            </div>
            <input
              id="company"
              v-model="company"
              name="company"
              type="text"
              required
              class="block w-full px-4 py-2.5 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              placeholder="Nome da sua empresa"
            />
          </div>
          <div>
            <label for="email" class="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
            <input
              id="email"
              v-model="email"
              name="email"
              type="email"
              required
              class="block w-full px-4 py-2.5 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              placeholder="voce@empresa.com"
            />
          </div>
        </div>

        <div>
          <button
            type="submit"
            :disabled="loading"
            class="group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg v-if="loading" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span v-else>Enviar link de redefinição</span>
          </button>
        </div>

        <div v-if="message" class="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm text-center">
          {{ message }}
        </div>

        <div v-if="error" class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm text-center">
          {{ error }}
        </div>

        <div class="text-center">
          <RouterLink to="/login" class="text-sm font-medium text-indigo-600 hover:text-indigo-500 transition-colors">
            ← Voltar para o login
          </RouterLink>
        </div>
      </form>
      </div>
    </div>
    <transition name="fade">
      <div v-if="companyLookup.visible" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-slate-900/50" @click="closeCompanyLookup"></div>
        <div class="relative bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md mx-4 p-6">
          <h3 class="text-lg font-semibold text-slate-900">Encontrar empresa</h3>
          <p class="mt-2 text-sm text-slate-600">Informe seu e-mail para localizar suas empresas.</p>
          <div class="mt-4 space-y-3">
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
              <input
                v-model="companyLookup.email"
                type="email"
                class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                placeholder="voce@empresa.com"
              />
            </div>
            <button
              type="button"
              @click="fetchCompaniesByEmail"
              :disabled="companyLookup.loading"
              class="w-full inline-flex justify-center items-center px-4 py-2.5 border border-transparent rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
            >
              {{ companyLookup.loading ? 'Buscando...' : 'Buscar empresas' }}
            </button>
          </div>

          <div v-if="companyLookup.error" class="mt-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
            {{ companyLookup.error }}
          </div>

          <div v-if="companyLookup.companies.length" class="mt-4">
            <p class="text-xs text-slate-500 mb-2">Selecione uma empresa:</p>
            <div class="space-y-2">
              <button
                v-for="companyName in companyLookup.companies"
                :key="companyName"
                type="button"
                @click="selectCompany(companyName)"
                class="w-full text-left px-3 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-sm"
              >
                {{ companyName }}
              </button>
            </div>
          </div>

          <div class="mt-6 flex justify-end">
            <button
              type="button"
              @click="closeCompanyLookup"
              class="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 border border-slate-300 hover:bg-slate-50"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </transition>
    <footer class="py-6 text-center text-xs text-slate-300">
      Copyright {{ new Date().getFullYear() }} ©
      <a
        href="https://chavemestragestao.com.br/"
        target="_blank"
        rel="noopener noreferrer"
        class="font-medium text-white/90 hover:text-white"
      >
        Chave Mestra Gestão
      </a>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import logoDark from '@/assets/logos/logo-dark.svg'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

const company = ref('')
const email = ref('')
const loading = ref(false)
const error = ref('')
const message = ref('')

const companyLookup = ref({
  visible: false,
  email: '',
  companies: [] as string[],
  loading: false,
  error: ''
})

const openCompanyLookup = () => {
  companyLookup.value.visible = true
  companyLookup.value.email = email.value
  companyLookup.value.companies = []
  companyLookup.value.error = ''
}

const closeCompanyLookup = () => {
  companyLookup.value.visible = false
}

const fetchCompaniesByEmail = async () => {
  companyLookup.value.loading = true
  companyLookup.value.error = ''
  companyLookup.value.companies = []

  try {
    const response = await fetch(`${apiBaseUrl}/auth/companies/by-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: companyLookup.value.email })
    })

    const data = await response.json()
    if (!response.ok) {
      companyLookup.value.error = data.error || 'Não foi possível buscar as empresas.'
      return
    }

    companyLookup.value.companies = data.companies || []
    if (companyLookup.value.companies.length === 0) {
      companyLookup.value.error = 'Nenhuma empresa encontrada para este e-mail.'
    }
  } catch {
    companyLookup.value.error = 'Falha ao buscar empresas. Tente novamente.'
  } finally {
    companyLookup.value.loading = false
  }
}

const selectCompany = (companyName: string) => {
  company.value = companyName
  closeCompanyLookup()
}

const handleSubmit = async () => {
  loading.value = true
  error.value = ''
  message.value = ''

  try {
    const response = await fetch(`${apiBaseUrl}/auth/password/forgot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: email.value, company: company.value })
    })

    const data = await response.json()
    if (!response.ok) {
      error.value = data.error || 'Falha ao solicitar redefinição de senha'
      return
    }

    message.value = 'Se existir uma conta com esse e-mail, você receberá o link de redefinição em instantes.'
  } catch {
    error.value = 'Falha ao solicitar redefinição de senha. Tente novamente.'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
