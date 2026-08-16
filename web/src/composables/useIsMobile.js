import { ref, onMounted, onUnmounted } from 'vue';

/** 响应式判断当前是否为移动端（<768px） */
export function useIsMobile(breakpoint = 767) {
  const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
  const isMobile = ref(mq.matches);
  const handler = (e) => { isMobile.value = e.matches; };
  onMounted(() => mq.addEventListener('change', handler));
  onUnmounted(() => mq.removeEventListener('change', handler));
  return { isMobile };
}
