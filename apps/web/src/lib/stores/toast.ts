import { writable } from 'svelte/store'

type Toast = { id: number; message: string; type: 'success' | 'error' | 'info' }

function createToastStore() {
  const { subscribe, update } = writable<Toast[]>([])
  let counter = 0

  return {
    subscribe,
    show(message: string, type: Toast['type'] = 'info', duration = 3000) {
      const id = ++counter
      update(toasts => [...toasts, { id, message, type }])
      setTimeout(() => {
        update(toasts => toasts.filter(t => t.id !== id))
      }, duration)
    },
    success(message: string) { this.show(message, 'success') },
    error(message: string) { this.show(message, 'error') },
    dismiss(id: number) {
      update(toasts => toasts.filter(t => t.id !== id))
    },
  }
}

export const toast = createToastStore()
