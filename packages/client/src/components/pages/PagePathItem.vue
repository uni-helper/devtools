<script setup lang="ts">
import type { PageInfo } from '@uni-helper/devtools-types'
import { VueButton, VueDropdown, VueInput } from '@vue/devtools-ui'

const props = defineProps<{
  page: PageInfo
}>()

const params = ref('')

function navigate() {
  const url = `/${props.page.path}`

  // @ts-expect-error uni在webview的js-sdk中有getEnv方法
  uni.getEnv(({ h5 }) => {
    if (h5) {
      trpc.changeCurrentPage.mutate({
        isTabBar: Boolean(props.page.tabBar),
        page: params.value ? `${url}?${params.value}` : url,
      })
    }
    else {
      const path = props.page.path
      uni[props.page.tabBar ? 'switchTab' : 'redirectTo']({
        url: params.value ? `${path}?${params.value}` : path,
      })
    }
  })
}
</script>

<template>
  <VueDropdown>
    <code cursor-pointer>
      <span>
        {{ `/${page.path}` }}
      </span>
    </code>
    <template #popper="{ hide }">
      <div p2>
        <form flex="~ col" @submit.prevent="() => { navigate(); hide() }">
          <div px2 text-sm op50>
            Fill params and navigate:
          </div>
          <div flex="~" items-center p2 text-sm font-mono>
            {{ `/${page.path}?` }}
            <VueInput
              v-model="params"
              n-sm w-20
              placeholder="params"
            />
          </div>
          <VueButton block type="primary">
            Navigate
          </VueButton>
        </form>
      </div>
    </template>
  </VueDropdown>
</template>
