<template>
  <div v-if="shouldRender" id="whatsapp-widget"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed, onBeforeUnmount } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRoute } from 'vue-router'

const auth = useAuthStore()
const route = useRoute()

// Environment variables
const isEnabled = import.meta.env.VITE_ENABLE_WHATSAPP_WIDGET === 'true'
const BASE_URL = import.meta.env.VITE_WHATSAPP_WIDGET_BASE_URL || 'https://cloudwhats.app.br'
const WIDGET_TOKEN = import.meta.env.VITE_WHATSAPP_WIDGET_TOKEN
const WIDGET_POSITION = import.meta.env.VITE_WHATSAPP_WIDGET_POSITION || 'bottom-right'
const PRIMARY_COLOR = import.meta.env.VITE_WHATSAPP_WIDGET_PRIMARY_COLOR || '#121212'
const HEADER_COLOR = import.meta.env.VITE_WHATSAPP_WIDGET_HEADER_COLOR || '#121212'

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

// State to track if widget is already initialized
const isWidgetLoaded = ref(false)
const WIDGET_SCRIPT_ID = 'whatsapp-widget-sdk'
const windowFlags = window as Window & {
  __whatsAppWidgetInitialized?: boolean
  __whatsAppWidgetReadyListenerAdded?: boolean
}

// Function to set user details
const setUserDetails = () => {
  if (window.WhatsAppWidget && auth.user) {
    window.WhatsAppWidget.setUser({
      name: auth.user.name,
      phone: auth.user.phone || ''
    })

    // Set custom attributes if needed
    window.WhatsAppWidget.setCustomAttributes({
      email: auth.user.email,
      userId: auth.user.id
    })
  }
}

// Function to load the WhatsApp Widget SDK
const ensureWidgetScript = () => {
  const existingScript = document.getElementById(WIDGET_SCRIPT_ID)
  if (existingScript) return

  const script = document.createElement('script')
  script.id = WIDGET_SCRIPT_ID
  script.src = `${BASE_URL}/widget.js`
  script.async = true
  script.onload = () => {
    isWidgetLoaded.value = true
  }
  document.body.appendChild(script)
}

const addReadyListenerOnce = () => {
  if (windowFlags.__whatsAppWidgetReadyListenerAdded) return
  window.addEventListener('widget:ready', handleWidgetReady)
  windowFlags.__whatsAppWidgetReadyListenerAdded = true
}

const loadWidget = () => {
  // If we already initialized the widget in this session, just ensure user details are up to date
  if (isWidgetLoaded.value) {
    setUserDetails()
    return
  }

  // If widget was already initialized globally, just ensure script/listeners exist
  if (windowFlags.__whatsAppWidgetInitialized) {
    if (window.WhatsAppWidget) {
      isWidgetLoaded.value = true
      setUserDetails()
    }
    addReadyListenerOnce()
    ensureWidgetScript()
    return
  }

  // Configure widget settings
  window.WhatsAppWidgetSettings = {
    position: WIDGET_POSITION,
    theme: {
      primaryColor: PRIMARY_COLOR,
      headerColor: HEADER_COLOR
    }
  }

  // Initialize widget queue
  window.WhatsAppWidgetQ = window.WhatsAppWidgetQ || []
  window.WhatsAppWidgetQ.push(['init', {
    token: WIDGET_TOKEN,
    baseUrl: BASE_URL
  }])

  windowFlags.__whatsAppWidgetInitialized = true

  // If the SDK is globally available (e.g. from a previous mount or hard refresh)
  if (window.WhatsAppWidget) {
    isWidgetLoaded.value = true
    setUserDetails()
    return
  }

  // Load the script dynamically (if not already present)
  ensureWidgetScript()

  // Listen for widget:ready event to set user details (only once)
  addReadyListenerOnce()
}

// Event handlers
const handleWidgetReady = () => {
  isWidgetLoaded.value = true
  setUserDetails()
}

// Function to show/hide widget
const showWidget = () => {
  const holder = document.querySelector('.whatsapp-widget-holder, [class*="whatsapp-widget"]') as HTMLElement
  if (holder) holder.style.display = 'block'
}

const hideWidget = () => {
  const holder = document.querySelector('.whatsapp-widget-holder, [class*="whatsapp-widget"]') as HTMLElement
  if (holder) holder.style.display = 'none'
}

// Watch for changes in shouldRender to load/hide widget
watch(shouldRender, (newValue) => {
  if (newValue) {
    loadWidget()
    showWidget()
  } else {
    hideWidget()
  }
}, { immediate: true })

// Watch for user changes to update details if already loaded
watch(() => auth.user, () => {
  if (shouldRender.value && isWidgetLoaded.value) {
    setUserDetails()
  }
}, { deep: true })

// Cleanup event listeners on unmount
onBeforeUnmount(() => {
  window.removeEventListener('widget:ready', handleWidgetReady)
  if (windowFlags.__whatsAppWidgetReadyListenerAdded) {
    windowFlags.__whatsAppWidgetReadyListenerAdded = false
  }
})
</script>

<script lang="ts">
declare global {
  interface Window {
    WhatsAppWidgetSettings: {
      position: string
      theme: {
        primaryColor: string
        headerColor: string
      }
    }
    WhatsAppWidgetQ: any[]
    WhatsAppWidget: {
      open: () => void
      close: () => void
      toggle: () => void
      setUser: (user: { name: string; phone: string }) => void
      setCustomAttributes: (attrs: Record<string, any>) => void
      reset: () => void
    }
    __whatsAppWidgetInitialized?: boolean
    __whatsAppWidgetReadyListenerAdded?: boolean
  }
}
</script>
