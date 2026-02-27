type ToastType = 'success' | 'error' | 'warning' | 'info';

type ToastFn = (type: ToastType, message: string) => void;

function extractErrorMessage(error: unknown): string | null {
  if (typeof error === 'string') {
    const trimmed = error.trim();
    return trimmed ? trimmed : null;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      const trimmed = message.trim();
      return trimmed ? trimmed : null;
    }
  }

  return null;
}

export function toastError(toast: ToastFn, error: unknown, fallbackMessage: string) {
  toast('error', extractErrorMessage(error) || fallbackMessage);
}
