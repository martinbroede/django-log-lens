const notificationController = {
  items: [],

  /**
   * Adds a new toast notification or updates an existing bottom-placed toast
   * @param {string} message - The toast message content
   * @param {string} type - The toast type (e.g., 'success', 'error', 'info', 'warning')
   * @param {string} placement - Where to place the toast (e.g., 'top', 'bottom')
   * @param {number} timeout - Time in milliseconds before auto-dismissal
   * @returns {void}
   */
  push(message, type, placement, timeout) {
    if (placement === "bottom") {
      const existing = this.items.find((item) => item.placement === "bottom");
      if (existing) {
        existing.message = message;
        existing.type = type;
        existing.isLeaving = false;

        if (existing.dismissTimer) {
          clearTimeout(existing.dismissTimer);
        }

        existing.dismissTimer = setTimeout(() => this.dismiss(existing.id), timeout);
        return;
      }
    }

    const id =
      globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const toastItem = { id, message, type, placement, isLeaving: false, dismissTimer: null };
    this.items.push(toastItem);
    toastItem.dismissTimer = setTimeout(() => this.dismiss(id), timeout);
  },

  /**
   * Dismisses and removes a toast notification by its ID
   * @param {string} id - The unique identifier of the toast to dismiss
   * @returns {void}
   */
  dismiss(id) {
    const toast = this.items.find((item) => item.id === id);
    if (!toast || toast.isLeaving) {
      return;
    }
    toast.isLeaving = true;
    if (toast.dismissTimer) {
      clearTimeout(toast.dismissTimer);
      toast.dismissTimer = null;
    }
    setTimeout(() => {
      this.items = this.items.filter((item) => item.id !== id);
    }, TOAST_EXIT_ANIMATION_MS);
  },
};
