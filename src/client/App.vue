<script setup>
import SideNav from './components/SideNav.vue'
</script>

<template>
  <main fixed inset-0 h-screen w-screen>
    <div
      grid="~ cols-[50px_1fr]"
      h-full h-screen of-hidden font-sans bg-base
    >
      <SideNav of-x-hidden of-y-auto />
      <RouterView />
    </div>
  </main>
</template>
