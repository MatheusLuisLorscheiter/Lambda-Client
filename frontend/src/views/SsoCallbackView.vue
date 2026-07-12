<template>
  <div class="min-h-screen flex items-center justify-center bg-slate-900">
    <div class="text-center">
      <svg class="animate-spin h-10 w-10 text-indigo-500 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <h2 class="text-xl font-semibold text-white">Autenticando via SSO...</h2>
      <p class="text-slate-400 mt-2 text-sm">{{ message }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const message = ref('Aguarde enquanto processamos seu login.')

onMounted(async () => {
  const code = route.query.code as string

  if (!code) {
    message.value = 'Código de autorização não encontrado.'
    setTimeout(() => router.push('/login'), 2000)
    return
  }

  try {
    const apiBase = import.meta.env.VITE_API_BASE_URL || '';
    const response = await fetch(`${apiBase}/auth/sso/chave-mestra`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        redirectUri: `${window.location.origin}/sso/callback`
      })
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Erro na autenticação')
    }

    // Set token in auth store
    // authStore in Lambda-Client typically has a token ref and user ref.
    authStore.token = data.token
    authStore.user = data.user
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))

    router.push('/dashboard')
  } catch (error: any) {
    message.value = error.message || 'Erro ao processar SSO.'
    setTimeout(() => router.push('/login'), 3000)
  }
})
</script>
