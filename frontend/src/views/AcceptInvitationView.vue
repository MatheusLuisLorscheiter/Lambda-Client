<template>
  <main class="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 px-4 py-10 text-slate-900">
    <section class="mx-auto w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl">
      <div class="border-b border-slate-200 bg-slate-50 px-7 py-6">
        <img :src="logoDark" alt="Lambda Pulse" class="h-10 w-auto" />
        <p class="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">Convite seguro</p>
        <h1 class="mt-1 text-2xl font-bold">Crie seu acesso</h1>
        <p class="mt-2 text-sm text-slate-600">Sua senha será definida somente por você e não será enviada por e-mail.</p>
      </div>

      <div class="px-7 py-7">
        <div v-if="loading" class="py-12 text-center text-sm text-slate-500">Validando convite…</div>

        <div v-else-if="loadError" class="rounded-xl border border-red-200 bg-red-50 p-5">
          <h2 class="font-semibold text-red-900">Este convite não está disponível</h2>
          <p class="mt-2 text-sm text-red-700">{{ loadError }}</p>
          <RouterLink to="/login" class="mt-5 inline-flex text-sm font-semibold text-indigo-700 hover:text-indigo-900">Ir para o login</RouterLink>
        </div>

        <div v-else-if="completed" class="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 class="font-semibold text-emerald-900">Acesso criado com sucesso</h2>
          <p class="mt-2 text-sm text-emerald-700">Sua conta está ativa. Você já pode entrar no ambiente de {{ invitation?.companyName }}.</p>
          <RouterLink to="/login" class="mt-5 inline-flex rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800">Entrar no Lambda Pulse</RouterLink>
        </div>

        <form v-else class="space-y-5" @submit.prevent="acceptInvitation">
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p class="font-semibold text-slate-900">{{ invitation?.companyName }}</p>
            <p class="mt-1 text-slate-600">{{ invitation?.email }}</p>
            <p class="mt-2 text-xs text-slate-500">Expira em {{ formatExpiry(invitation?.expiresAt) }}</p>
          </div>
          <label class="block">
            <span class="mb-1.5 block text-sm font-medium">Nova senha</span>
            <input v-model="password" type="password" autocomplete="new-password" minlength="12" required class="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200" placeholder="No mínimo 12 caracteres" />
            <span class="mt-1.5 block text-xs text-slate-500">Use uma frase longa e exclusiva. Máximo de 72 bytes.</span>
          </label>
          <label class="block">
            <span class="mb-1.5 block text-sm font-medium">Confirmar senha</span>
            <input v-model="confirmation" type="password" autocomplete="new-password" minlength="12" required class="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200" />
          </label>
          <p v-if="submitError" class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{{ submitError }}</p>
          <button type="submit" :disabled="submitting" class="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
            {{ submitting ? 'Ativando acesso…' : 'Aceitar convite e criar acesso' }}
          </button>
        </form>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import logoDark from '@/assets/logos/logo-dark.svg'

interface Invitation { email: string; companyName: string; expiresAt: string }
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || ''
const auth = useAuthStore()
const router = useRouter()
const invitation = ref<Invitation | null>(null)
const token = ref('')
const password = ref('')
const confirmation = ref('')
const loading = ref(true)
const submitting = ref(false)
const completed = ref(false)
const loadError = ref('')
const submitError = ref('')

const readToken = () => {
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const value = fragment.get('token') || ''
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  return value
}

const post = async (path: string, body: Record<string, unknown>) => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a solicitação')
  return data
}

onMounted(async () => {
  token.value = readToken()
  if (!token.value) {
    loadError.value = 'O link está incompleto. Solicite um novo convite ao administrador.'
    loading.value = false
    return
  }
  try {
    const data = await post('/auth/invitations/inspect', { token: token.value })
    invitation.value = data.invitation
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Solicite um novo convite ao administrador.'
  } finally {
    loading.value = false
  }
})

const acceptInvitation = async () => {
  submitError.value = ''
  if (password.value !== confirmation.value) {
    submitError.value = 'As senhas não conferem.'
    return
  }
  if (password.value.length < 12) {
    submitError.value = 'A senha deve ter pelo menos 12 caracteres.'
    return
  }
  submitting.value = true
  try {
    const session = await post('/auth/invitations/accept', { token: token.value, password: password.value })
    auth.establishSession(session)
    token.value = ''
    password.value = ''
    confirmation.value = ''
    completed.value = true
    await router.push('/dashboard')
  } catch (error) {
    submitError.value = error instanceof Error ? error.message : 'Não foi possível aceitar o convite.'
  } finally {
    submitting.value = false
  }
}

const formatExpiry = (value?: string) => value
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '—'
</script>
