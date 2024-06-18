<script setup lang="ts">
const { init } = useInitState()
init()
const router = useRouter()
const clientState = devtoolsClientState
if (clientState.value.route !== '/')
  router.replace(clientState.value.route)
</script>

<template>
  <main fixed inset-0 h-screen w-screen>
    <Suspense>
      <div
        :class="clientState.isFirstVisit ? 'flex' : 'grid grid-cols-[50px_1fr]'"
        h-full h-screen of-hidden font-sans bg-base
      >
        <SideNav v-if="!clientState.isFirstVisit" of-x-hidden of-y-auto />
        <RouterView />
      </div>
      <template #fallback>
        <AppConnecting />
      </template>
    </Suspense>
  </main>
</template>
