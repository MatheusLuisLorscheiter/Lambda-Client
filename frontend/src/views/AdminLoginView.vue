<template>
  <div class="min-h-screen flex flex-col bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
    <div class="flex-1 flex items-center justify-center">
      <div class="max-w-md w-full space-y-8 bg-white shadow-2xl rounded-2xl px-8 py-10 mx-4">
        <div class="flex flex-col items-center">
          <button
            type="button"
            class="eyes-button"
            @click="unlockAdminAccess"
            :aria-label="adminUnlocked ? 'Acesso liberado' : 'Clique para liberar o acesso administrativo'"
          >
            <span class="eyes">
              <span class="eye"><span class="pupil"></span></span>
              <span class="eye"><span class="pupil"></span></span>
            </span>
          </button>
          <h2 class="mt-6 text-center text-2xl font-bold text-slate-900">
            Você tem certeza que está no lugar correto?
          </h2>
        </div>
        <form class="mt-8 space-y-5" @submit.prevent="handleLogin">
          <div v-if="adminUnlocked" class="space-y-4">
            <div>
              <label for="email" class="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
              <input
                id="email"
                v-model="email"
                name="email"
                type="email"
                required
                class="block w-full px-4 py-2.5 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                placeholder="admin@suaempresa.com"
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
          <div v-if="adminUnlocked">
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

          <div v-if="adminUnlocked && error" class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm text-center">
            {{ error }}
          </div>

          <div class="text-sm text-center">
            <RouterLink
              to="/login"
              class="inline-flex w-full items-center justify-center px-4 py-2.5 rounded-lg text-sm font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors"
            >
              Entrei por engano, sou cliente
            </RouterLink>
          </div>
        </form>
      </div>
    </div>
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
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { RouterLink } from 'vue-router'

const auth = useAuthStore()
const router = useRouter()

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')
const adminUnlocked = ref(false)

const unlockAdminAccess = () => {
  adminUnlocked.value = true
}

const handleLogin = async () => {
  loading.value = true
  error.value = ''

  try {
    await auth.adminLogin(email.value, password.value)
    router.push('/admin')
  } catch {
    error.value = 'Credenciais inválidas. Verifique e-mail e senha.'
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

.eyes-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 96px;
  height: 60px;
  border-radius: 9999px;
  background: transparent;
  box-shadow: none;
  cursor: default;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.eyes-button:hover {
  transform: translateY(-1px);
  box-shadow: none;
}

.eyes {
  display: inline-flex;
  gap: 12px;
}

.eye {
  width: 30px;
  height: 52px;
  background: #f8fafc;
  border-radius: 9999px;
  border: 1px solid #cbd5f5;
  box-shadow: 0 4px 10px rgba(148, 163, 184, 0.2);
  position: relative;
  overflow: hidden;
}

.eye::before,
.eye::after {
  content: '';
  position: absolute;
  left: 0;
  width: 100%;
  height: 50%;
  background: linear-gradient(to bottom, #e2e8f0 0%, #cbd5e1 100%);
  z-index: 2;
}

.eye::before {
  top: 0;
  border-radius: 9999px 9999px 0 0;
  transform: translateY(-100%);
  animation: blink-top 4.2s infinite;
}

.eye::after {
  bottom: 0;
  border-radius: 0 0 9999px 9999px;
  transform: translateY(100%);
  animation: blink-bottom 4.2s infinite;
}

.pupil {
  width: 12px;
  height: 12px;
  background: #0f172a;
  border-radius: 9999px;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  animation: look-around 2.8s ease-in-out infinite;
}

@keyframes look-around {
  0%, 100% {
    transform: translate(-50%, -50%);
  }
  25% {
    transform: translate(-25%, -60%);
  }
  50% {
    transform: translate(-70%, -35%);
  }
  75% {
    transform: translate(-40%, -30%);
  }
}

@keyframes blink-top {
  0%, 88%, 100% {
    transform: translateY(-100%);
  }
  90%, 92% {
    transform: translateY(0%);
  }
}

@keyframes blink-bottom {
  0%, 88%, 100% {
    transform: translateY(100%);
  }
  90%, 92% {
    transform: translateY(0%);
  }
}
</style>
