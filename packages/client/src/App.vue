<script setup lang="ts">
const { init, versionState } = useInitState()
init()
const router = useRouter()
const clientState = devtoolsClientState
if (clientState.value.route !== '/')
  router.replace(clientState.value.route)
</script>

<template>
  <main fixed inset-0 h-screen w-screen>
    <Suspense>
      <AppConnecting v-if="!versionState?.vueVersion" />
      <div
        v-else
        :class="clientState.isFirstVisit ? 'flex' : 'grid grid-cols-[50px_1fr]'" h-full h-screen of-hidden font-sans
        bg-base
      >
        <SideNav v-if="!clientState.isFirstVisit" of-x-hidden of-y-auto />
        <RouterView v-slot="{ Component }">
          <KeepAlive>
            <component :is="Component" />
          </KeepAlive>
        </RouterView>
      </div>
    </Suspense>
  </main>
</template>
