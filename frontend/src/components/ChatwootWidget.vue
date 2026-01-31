<template>
  <div v-if="shouldRender" id="chatwoot-widget"></div>
</template>

<script setup lang="ts">
import { onMounted, watch, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRoute } from 'vue-router'

const auth = useAuthStore()
const route = useRoute()

// Environment variables
const isEnabled = import.meta.env.VITE_ENABLE_CHATWOOT === 'true'
const BASE_URL = import.meta.env.VITE_CHATWOOT_BASE_URL || 'https://app.chatwoot.com'
const WEBSITE_TOKEN = import.meta.env.VITE_CHATWOOT_TOKEN

// Computed property to determine if widget should be active
// 1. Feature flag must be true
// 2. User must be logged in
// 3. User must NOT be on an admin route
const shouldRender = computed(() => {
  if (!isEnabled) return false
  if (!auth.isAuthenticated) return false
  if (String(route.path).startsWith('/admin')) return false
  return true
})

// Function to load the Chatwoot SDK
const loadChatwoot = () => {
  if (window.chatwootSDK) {
    // Already loaded, just ensuring it's visible or re-initialized if needed
    // Chatwoot usually persists, but we can call run again if we want to ensure settings
    window.chatwootSDK.run({
      websiteToken: WEBSITE_TOKEN,
      baseUrl: BASE_URL
    })
    return
  }

  const script = document.createElement('script')
  script.src = `${BASE_URL}/packs/js/sdk.js`
  script.async = true
  script.onload = () => {
    window.chatwootSDK.run({
      websiteToken: WEBSITE_TOKEN,
      baseUrl: BASE_URL
    })
  }
  document.body.appendChild(script)
}

// Watch for changes in shouldRender to load/hide widget
// Note: Chatwoot SDK doesn't have a simple "destroy" method exposed easily in the snippet,
// usually it hides itself if we wanted to, but for now we just load it when conditions are met.
// If the user navigates to admin, the widget might persist unless we hide it via CSS or DOM,
// but standard Chatwoot behavior is persistent.
// However, to strictly follow "except in admin routes", we might want to hide it.
// The SDK inserts a bubble. We can hide `.woot-widget-holder` if !shouldRender.

watch(shouldRender, (newValue) => {
  if (newValue) {
    loadChatwoot()
    // Ensure visible
    const holder = document.querySelector('.woot-widget-holder') as HTMLElement
    if (holder) holder.style.display = 'block'
  } else {
    // Hide if present
    const holder = document.querySelector('.woot-widget-holder') as HTMLElement
    if (holder) holder.style.display = 'none'
  }
}, { immediate: true })

onMounted(() => {
  if (shouldRender.value) {
    loadChatwoot()
  }
})
</script>

<script lang="ts">
declare global {
  interface Window {
    chatwootSDK: any;
  }
}
</script>
