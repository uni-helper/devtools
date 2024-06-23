import { defineStore } from 'pinia';

export const useCounterStore1 = defineStore('counter1', () => {
	const count = ref(0);
  const doubleCount = computed(() => count.value * 2);
	function inc() {
		count.value++;
	}
  function dec() {
    count.value--;
  }

	return { count, inc,dec, doubleCount };
});
