<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView, useRouter } from 'vue-router'

const router = useRouter()

// Handle Google OAuth callback: backend redirects to GOOGLE_FRONTEND_REDIRECT?token=xxx&user_id=yyy
onMounted(() => {
  const urlParams = new URLSearchParams(window.location.search)
  const token = urlParams.get('token')
  const userId = urlParams.get('user_id')

  if (token && userId) {
    localStorage.setItem('token', token)
    localStorage.setItem('user_id', userId)
    const redirect = urlParams.get('redirect_url')
    window.history.replaceState({}, document.title, window.location.pathname)
    router.replace(redirect || window.location.pathname || '/')
  }
})
</script>

<template>
  <main class="app">
    <RouterView />
  </main>
</template>
