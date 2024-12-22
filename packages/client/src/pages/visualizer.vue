<script setup lang="ts">
const injectStyle = `
  :root {
    --background-color: #121212 !important;
  }
  main {
    padding: 0 !important;
  }
  svg {
    margin-top: 20px;
    vertical-align: middle;
    width: 100%;
    height: calc(100% - 20px);
    max-height: 100vh;
  }
  .tooltip {
    border: 1px solid #2D2F31;
    max-width: 90vw;
    white-space: unset;
  }
`
</script>

<template>
  <IframeView src="/visualizer" :inject-style="injectStyle" />
</template>
