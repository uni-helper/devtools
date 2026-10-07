import { defineStore } from 'pinia';

export const useCounterStore1 = defineStore('counter1', () => {
  const test=1
	const count = ref(test);
  const doubleCount = computed(() => count.value * 2);
	function inc() {
		count.value++;
	}
  function dec() {
    count.value--;
  }

	return { count, inc,dec, doubleCount };
});
