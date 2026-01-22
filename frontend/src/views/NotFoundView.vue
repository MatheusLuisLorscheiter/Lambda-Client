<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 px-4">
    <div class="max-w-md w-full text-center bg-white shadow-2xl rounded-2xl px-8 py-10">
      <div class="flex flex-col items-center">
        <img :src="logoDark" alt="Logo da empresa" class="h-12 w-auto" />
        <h1 class="mt-6 text-3xl font-bold text-slate-900">Página não encontrada</h1>
        <p class="mt-2 text-sm text-slate-600">
          A página que você tentou acessar não existe ou foi movida.
        </p>
      </div>
      <div class="mt-6 flex flex-col gap-3">
        <RouterLink
          to="/login"
          class="w-full inline-flex justify-center items-center px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
        >
          Ir para o login
        </RouterLink>
        <button
          type="button"
          @click="goBack"
          class="w-full inline-flex justify-center items-center px-4 py-2.5 rounded-lg text-sm font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 transition-colors"
        >
          Voltar
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter, RouterLink } from 'vue-router'
import logoDark from '@/assets/logos/logo-dark.svg'

const router = useRouter()

const goBack = () => {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push('/login')
  }
}
</script>
