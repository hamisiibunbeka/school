/** Read Laravel's XSRF cookie for JSON (non-Inertia) requests. */
function xsrfToken(): string {
    const match = document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN='));
    return match ? decodeURIComponent(match.split('=')[1]) : '';
}

/** POST JSON and return the parsed body; throws {status, errors} on failure. */
export async function postJson<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-XSRF-TOKEN': xsrfToken() },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw { status: res.status, errors: (data?.errors ?? {}) as Record<string, string[]>, message: data?.message as string | undefined };
    return data as T;
}

/** ISO date-time -> value for <input type="datetime-local"> in local time. */
export function toLocalInput(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** SMS credits for a message (160 characters per credit). */
/** Billable SMS parts, matching the server (App\Services\Messaging\GsmText): 160 characters for one SMS, 153 per part when longer. */
export function smsCredits(text: string): number {
    const length = [...text].reduce((n, ch) => n + ('^{}\\[~]|€'.includes(ch) ? 2 : 1), 0);
    return length <= 160 ? 1 : Math.ceil(length / 153);
}

export const VARIABLE_HINTS: Record<string, string> = {
    '{student_name}': 'Ward name(s)',
    '{guardian_name}': 'Recipient name',
    '{balance}': 'Outstanding fee balance',
    '{school_name}': 'School name',
    '{class}': 'Class & stream',
};
