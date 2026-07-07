<script setup>
defineProps({ compact: Boolean, light: { type: Boolean, default: true } })
</script>

<template>
  <div class="brand" :class="{ compact, light }">
    <span class="mark" aria-hidden="true">
      <i class="leaf leaf-left"></i><i class="leaf leaf-right"></i>
      <svg viewBox="0 0 54 54"><path d="M15 23c5-4 9-3 12 2 3-5 7-6 12-2v13c-4 6-8 8-12 10-4-2-8-4-12-10V23Z"/><path d="M27 20v19M20 31h14"/></svg>
    </span>
    <span v-if="!compact" class="brand-name">护理培训系统</span>
  </div>
</template>

<style scoped>
.brand { display: flex; align-items: center; gap: 14px; color: #16342a; }
.brand.light { color: white; }
.mark { position: relative; display: grid; place-items: center; width: 58px; height: 58px; }
.compact .mark { width: 38px; height: 38px; }
.leaf { position: absolute; top: 2px; width: 31px; height: 39px; background: linear-gradient(145deg,#9edb38,#53b634); border-radius: 70% 70% 55% 55%; }
.compact .leaf { width: 21px; height: 27px; }
.leaf-left { left: 5px; transform: rotate(-35deg); }
.leaf-right { right: 5px; transform: rotate(35deg); }
.mark svg { z-index: 1; width: 48px; height: 48px; fill: #fff; stroke: #159051; stroke-width: 2.4; stroke-linecap: round; }
.compact .mark svg { width: 32px; height: 32px; }
.brand-name { font-size: 34px; font-weight: 700; letter-spacing: 2px; white-space: nowrap; }
.compact + * { display: none; }
</style>
