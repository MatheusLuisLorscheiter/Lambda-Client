<template>
  <div class="min-h-screen flex flex-col bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
    <div class="flex-1 flex items-center justify-center">
      <div class="max-w-md w-full space-y-8 bg-white shadow-2xl rounded-2xl px-8 py-10 mx-4">
      <div class="flex flex-col items-center">
        <img :src="logoDark" alt="Company logo" class="h-14 w-auto" />
        <h2 class="mt-6 text-center text-2xl font-bold text-slate-900">
          Bem-vindo de volta
        </h2>
        <p class="mt-2 text-sm text-slate-500">Monitore suas funções AWS Lambda em tempo real</p>
      </div>
      <form class="mt-8 space-y-5" @submit.prevent="handleLogin">
        <div class="space-y-4">
          <div>
            <label for="company" class="block text-sm font-medium text-slate-700 mb-1">Empresa</label>
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
          <div>
            <label for="password" class="block text-sm font-medium text-slate-700 mb-1">Senha</label>
            <input
              id="password"
              v-model="password"
              name="password"
              type="password"
              required
              class="block w-full px-4 py-2.5 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              placeholder="••••••••"
            />
          </div>
        </div>

        <div class="text-sm text-right">
          <RouterLink to="/forgot" class="font-medium text-indigo-600 hover:text-indigo-500 transition-colors">Esqueci minha senha</RouterLink>
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
            <span v-else>Entrar</span>
          </button>
        </div>

        <div v-if="error" class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm text-center">
          {{ error }}
        </div>
      </form>
      </div>
    </div>
    <footer class="py-6 text-center text-xs text-slate-300">
      Desenvolvido pela
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
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { RouterLink } from 'vue-router'
import logoDark from '@/assets/logos/logo-dark.svg'

const auth = useAuthStore()
const router = useRouter()

const company = ref('')
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

const handleLogin = async () => {
  loading.value = true
  error.value = ''

  try {
    await auth.login(email.value, password.value, company.value)

    if (auth.isAdmin) {
      router.push('/admin')
    } else {
      router.push('/dashboard')
    }
  } catch {
    error.value = 'Credenciais inválidas. Verifique empresa, e-mail e senha.'
  } finally {
    loading.value = false
  }
}
</script>