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

// Function to set user details
const setUserDetails = () => {
  if (window.$chatwoot && auth.user) {
    // Generate a unique identifier if possible, but email is often used directly or a hash
    // The documentation mentions `setUser(identifier, { ... })`.
    // If we have a user ID, we should use it.
    const identifier = auth.user.id || auth.user.email
    
    window.$chatwoot.setUser(identifier, {
      email: auth.user.email,
      name: auth.user.name,
      // You can add more properties here if needed, like company name
      identifier_hash: '' // If using HMAC, add it here
    })
  }
}

// Function to load the Chatwoot SDK
const loadChatwoot = () => {
  // If already loaded and available globally
  if (window.chatwootSDK || window.$chatwoot) {
    if (window.chatwootSDK) {
        window.chatwootSDK.run({
            websiteToken: WEBSITE_TOKEN,
            baseUrl: BASE_URL
        })
    }
    // Set user details after run
    setTimeout(setUserDetails, 1000) 
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
    // Set user after loading
    setTimeout(setUserDetails, 1000)
  }
  document.body.appendChild(script)
}

// Watch for changes in shouldRender to load/hide widget
watch(shouldRender, (newValue) => {
  if (newValue) {
    loadChatwoot()
    const holder = document.querySelector('.woot-widget-holder') as HTMLElement
    if (holder) holder.style.display = 'block'
  } else {
    const holder = document.querySelector('.woot-widget-holder') as HTMLElement
    if (holder) holder.style.display = 'none'
  }
}, { immediate: true })

// Watch for user changes to update details if already loaded
watch(() => auth.user, () => {
  if (shouldRender.value) {
    setUserDetails()
  }
}, { deep: true })

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
    $chatwoot: any;
  }
}
</script>
