import Swal from 'sweetalert2';

type ToastType = 'success' | 'error' | 'info' | 'warning';

const colorFor: Record<ToastType, string> = {
    success: 'color-success',
    error: 'color-danger',
    info: 'color-info',
    warning: 'color-warning',
};

/** Vristo-style coloured toast in the top-right corner. */
export function toast(message: string, type: ToastType = 'success'): void {
    void Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3500,
        timerProgressBar: true,
        showCloseButton: true,
        customClass: { popup: colorFor[type] },
    }).fire({ title: message });
}

/** Confirmation dialog. Resolves true when the user confirms. */
export async function confirm(options: {
    title?: string;
    text?: string;
    confirmText?: string;
    danger?: boolean;
    input?: 'text' | 'textarea';
    inputPlaceholder?: string;
}): Promise<{ confirmed: boolean; value?: string }> {
    const result = await Swal.fire({
        title: options.title ?? 'Are you sure?',
        text: options.text,
        icon: options.danger ? 'warning' : 'question',
        showCancelButton: true,
        confirmButtonText: options.confirmText ?? 'Yes, continue',
        cancelButtonText: 'Cancel',
        reverseButtons: true,
        padding: '2em',
        input: options.input,
        inputPlaceholder: options.inputPlaceholder,
        inputValidator: options.input ? (v) => (!v ? 'A reason is required' : undefined) : undefined,
        customClass: { confirmButton: options.danger ? 'btn-danger-confirm' : '' },
    });
    return { confirmed: result.isConfirmed, value: typeof result.value === 'string' ? result.value : undefined };
}
