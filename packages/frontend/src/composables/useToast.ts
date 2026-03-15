import { ref } from 'vue';

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; fn: () => void };
  type: 'info' | 'success';
}

const toasts = ref<Toast[]>([]);
let nextId = 1;

export function useToast() {
  function show(message: string, opts?: { action?: Toast['action']; type?: Toast['type']; duration?: number }) {
    const id = nextId++;
    toasts.value.push({ id, message, action: opts?.action, type: opts?.type ?? 'info' });
    setTimeout(() => dismiss(id), opts?.duration ?? 8000);
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }

  return { toasts, show, dismiss };
}
