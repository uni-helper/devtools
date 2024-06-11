<script setup lang="ts">
const { init } = useInitState()
init()
</script>

<template>
  <main fixed inset-0 h-screen w-screen>
    <Suspense>
      <div
        grid="~ cols-[50px_1fr]"
        h-full h-screen of-hidden font-sans bg-base
      >
        <SideNav of-x-hidden of-y-auto />
        <RouterView />
      </div>
      <template #fallback>
        Loading...
      </template>
    </Suspense>
  </main>
</template>
