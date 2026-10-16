import { router, useForm, usePage } from "@inertiajs/react";
import {
    ArrowDownLeft,
    ArrowUpRight,
    KeyRound,
    ListOrdered,
    RotateCcw,
    Scale,
    Wallet,
} from "lucide-react";
import {
    useEffect,
    useMemo,
    useState,
    type FormEvent,
    type ReactNode,
} from "react";
import {
    Checkbox,
    FormGrid,
    Input,
    Select,
    Textarea,
} from "@/components/ui/form";
import Modal from "@/components/ui/modal";
import Tabs from "@/components/ui/tabs";
import { confirm } from "@/lib/swal";
import { cn, money, titleCase } from "@/lib/utils";
import type { Option } from "@/types";
import SearchSelect from "../../_components/search-select";

export type StudentOption = Option & {
    balance: string | null;
    closed: boolean;
};
export type CustodianOption = Option & { held: string; wallets: number };

export type WalletRow = {
    id: number;
    student_id: number;
    student: string;
    admission_no: string;
    photo_url: string | null;
    class: string;
    custodian: string | null;
    balance: string;
    daily_limit: string | null;
    withdrawn_today: string | null;
    has_pin: boolean;
    pin_locked: boolean;
    status: "active" | "closed";
    last_activity: string | null;
};

export type Txn = {
    id: number;
    reference: string;
    type: "deposit" | "withdrawal" | "reversal";
    amount: string;
    balance_after: string;
    transacted_at: string;
    method: string | null;
    counterparty: string | null;
    counterparty_phone: string | null;
    category: string | null;
    description: string | null;
    pin_verified: boolean;
    limit_override_reason: string | null;
    recorded_by: string | null;
    reversed: boolean;
    reversible: boolean;
};

export function useCurrency(): string {
    return usePage().props.school?.currency ?? "TZS";
}

export function PocketNav({
    active,
}: {
    active: "wallets" | "transactions" | "cash-counts";
}) {
    const links = {
        wallets: "/boarding/pocket-money",
        transactions: "/boarding/pocket-money/transactions",
        "cash-counts": "/boarding/pocket-money/cash-counts",
    };
    return (
        <Tabs
            active={active}
            onChange={(k) => router.visit(links[k as keyof typeof links])}
            tabs={[
                { key: "wallets", label: "Student wallets", icon: Wallet },
                { key: "transactions", label: "Day book", icon: ListOrdered },
                {
                    key: "cash-counts",
                    label: "Cash counts & handover",
                    icon: Scale,
                },
            ]}
        />
    );
}

/** Signed amount: green for money in, red for money out. */
export function Amount({
    value,
    className,
}: {
    value: string | number;
    className?: string;
}) {
    const cur = useCurrency();
    const n = Number(value);
    return (
        <span
            className={cn(
                "font-bold whitespace-nowrap",
                n > 0
                    ? "text-success"
                    : n < 0
                      ? "text-danger"
                      : "text-white-dark",
                className,
            )}
        >
            {n > 0 ? "+" : n < 0 ? "−" : ""}
            {money(Math.abs(n), cur)}
        </span>
    );
}

export function TypeBadge({
    txn,
}: {
    txn: Pick<Txn, "type" | "reversed" | "category">;
}) {
    const map = {
        deposit: {
            icon: ArrowDownLeft,
            cls: "badge-soft-success",
            label: "Deposit",
        },
        withdrawal: {
            icon: ArrowUpRight,
            cls: "badge-soft-danger",
            label: txn.category === "refund" ? "Refund" : "Withdrawal",
        },
        reversal: {
            icon: RotateCcw,
            cls: "badge-soft-dark",
            label: "Reversal",
        },
    }[txn.type];
    const Icon = map.icon;
    return (
        <span className="inline-flex items-center gap-1">
            <span
                className={cn("badge inline-flex items-center gap-1", map.cls)}
            >
                <Icon className="h-3 w-3" /> {map.label}
            </span>
            {txn.reversed && (
                <span className="badge badge-outline-dark line-through">
                    reversed
                </span>
            )}
        </span>
    );
}

export function PinBadge({
    wallet,
}: {
    wallet: Pick<WalletRow, "has_pin" | "pin_locked">;
}) {
    if (!wallet.has_pin) return null;
    return (
        <span
            className={cn(
                "badge inline-flex items-center gap-1",
                wallet.pin_locked ? "badge-soft-danger" : "badge-soft-info",
            )}
            title={
                wallet.pin_locked ? "PIN locked — reset it" : "PIN protected"
            }
        >
            <KeyRound className="h-3 w-3" />{" "}
            {wallet.pin_locked ? "PIN locked" : "PIN"}
        </span>
    );
}

/** After a deposit/withdrawal offer to print the slip straight away. */
function offerReceipt(page: { flash?: unknown }) {
    const id = (page.flash as { pocket_money_receipt?: number } | undefined)
        ?.pocket_money_receipt;
    if (!id) return;
    // Wait for the modal's leave transition so the dialog is clickable.
    setTimeout(
        () =>
            void confirm({
                title: "Print a slip?",
                text: "Give the student a signed slip so both sides keep a record of this transaction.",
                confirmText: "Print slip",
            }).then(({ confirmed }) => {
                if (confirmed)
                    router.visit(
                        `/boarding/pocket-money/transactions/${id}/receipt`,
                    );
            }),
        350,
    );
}

/** Second step of every money form: read the figures back before saving. */
function Review({
    rows,
    note,
    onBack,
    processing,
    confirmLabel,
    tone,
}: {
    rows: [string, ReactNode][];
    note: string;
    onBack: () => void;
    processing: boolean;
    confirmLabel: string;
    tone: "success" | "danger";
}) {
    return (
        <div className="space-y-4">
            <table className="w-full text-sm">
                <tbody>
                    {rows.map(([k, v]) => (
                        <tr
                            key={k}
                            className="border-b border-white-light dark:border-[#1b2e4b]"
                        >
                            <td className="py-2 font-semibold text-white-dark">
                                {k}
                            </td>
                            <td className="py-2 text-end font-bold text-black dark:text-white-light">
                                {v}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className="rounded-md bg-warning-light p-3 text-sm text-warning dark:bg-warning-dark-light">
                {note}
            </p>
            <div className="flex justify-center gap-3">
                <button
                    type="button"
                    className="btn btn-outline-dark"
                    onClick={onBack}
                >
                    Back
                </button>
                <button
                    className={cn(
                        "btn",
                        tone === "success" ? "btn-success" : "btn-danger",
                    )}
                    disabled={processing}
                >
                    {confirmLabel}
                </button>
            </div>
        </div>
    );
}

export function DepositModal({
    open,
    onClose,
    students,
    methods,
    studentId,
}: {
    open: boolean;
    onClose: () => void;
    students: StudentOption[];
    methods: Option[];
    studentId?: number | null;
}) {
    const cur = useCurrency();
    const form = useForm({
        student_id: "",
        amount: "",
        method: "cash",
        counterparty: "",
        counterparty_phone: "",
        description: "",
        notify: false,
    });
    const [review, setReview] = useState(false);

    useEffect(() => {
        if (open) {
            setReview(false);
            form.reset();
            form.clearErrors();
            if (studentId) form.setData("student_id", String(studentId));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, studentId]);

    const student = students.find(
        (s) => String(s.value) === String(form.data.student_id),
    );
    const balance = Number(student?.balance ?? 0);
    const after = balance + Number(form.data.amount || 0);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        if (!review) return setReview(true);
        form.post("/boarding/pocket-money/deposit", {
            preserveScroll: true,
            onSuccess: (page) => {
                onClose();
                offerReceipt(page);
            },
            onError: () => setReview(false),
        });
    };

    if (review) {
        return (
            <Modal
                open={open}
                onClose={onClose}
                title="Confirm deposit"
                size="lg"
            >
                <form onSubmit={submit}>
                    <Review
                        rows={[
                            ["Student", student?.label],
                            [
                                "Amount received",
                                <span className="text-success">
                                    {money(form.data.amount, cur)}
                                </span>,
                            ],
                            ["Handed over by", form.data.counterparty],
                            ["Via", titleCase(form.data.method)],
                            ["Balance now", money(balance, cur)],
                            ["Balance after", money(after, cur)],
                        ]}
                        note="Count the cash together with the student and confirm the amount matches before saving."
                        onBack={() => setReview(false)}
                        processing={form.processing}
                        confirmLabel="Confirm deposit"
                        tone="success"
                    />
                </form>
            </Modal>
        );
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Receive pocket money"
            size="lg"
        >
            <form onSubmit={submit} className="space-y-4">
                <SearchSelect
                    label="Student"
                    required
                    options={students}
                    value={form.data.student_id}
                    onChange={(v) => form.setData("student_id", v)}
                    error={form.errors.student_id}
                    disabled={!!studentId}
                    renderOption={(o) => (
                        <div className="flex w-full items-center justify-between gap-2">
                            <span>{o.label}</span>
                            {o.balance !== null && (
                                <span className="text-xs text-white-dark">
                                    {o.closed
                                        ? "closed"
                                        : money(o.balance, cur)}
                                </span>
                            )}
                        </div>
                    )}
                />
                {student?.closed && (
                    <p className="text-sm text-danger">
                        This student's wallet is closed. Reopen it from the
                        statement page first.
                    </p>
                )}
                <FormGrid>
                    <Input
                        label={`Amount (${cur})`}
                        type="number"
                        min={1}
                        step="any"
                        required
                        value={form.data.amount}
                        onChange={(e) => form.setData("amount", e.target.value)}
                        error={form.errors.amount}
                    />
                    <Select
                        label="Received via"
                        options={methods}
                        value={form.data.method}
                        onChange={(e) => form.setData("method", e.target.value)}
                        error={form.errors.method}
                    />
                    <Input
                        label="Handed over by"
                        required
                        placeholder="e.g. the student, or parent's name"
                        value={form.data.counterparty}
                        onChange={(e) =>
                            form.setData("counterparty", e.target.value)
                        }
                        error={form.errors.counterparty}
                    />
                    <Input
                        label="Their phone"
                        value={form.data.counterparty_phone}
                        onChange={(e) =>
                            form.setData("counterparty_phone", e.target.value)
                        }
                        error={form.errors.counterparty_phone}
                    />
                </FormGrid>
                <Input
                    label="Note"
                    placeholder="e.g. M-Pesa ref, denominations"
                    value={form.data.description}
                    onChange={(e) =>
                        form.setData("description", e.target.value)
                    }
                    error={form.errors.description}
                />
                {student && (
                    <div className="rounded-md bg-primary-light p-3 text-sm dark:bg-primary-dark-light">
                        Current balance <b>{money(balance, cur)}</b> → after
                        deposit{" "}
                        <b className="text-success">{money(after, cur)}</b>
                    </div>
                )}
                <Checkbox
                    label="Send the guardian an SMS confirmation"
                    checked={form.data.notify}
                    onChange={(e) => form.setData("notify", e.target.checked)}
                />
                <div className="flex justify-center gap-3">
                    <button
                        type="button"
                        className="btn btn-outline-dark"
                        onClick={onClose}
                    >
                        Cancel
                    </button>
                    <button
                        className="btn btn-success"
                        disabled={form.processing || student?.closed}
                    >
                        Continue
                    </button>
                </div>
            </form>
        </Modal>
    );
}

export function WithdrawModal({
    wallet,
    onClose,
    categories,
}: {
    wallet: WalletRow | null;
    onClose: () => void;
    categories: Option[];
}) {
    const cur = useCurrency();
    const form = useForm({
        amount: "",
        category: "canteen",
        description: "",
        counterparty: "",
        pin: "",
        limit_override_reason: "",
        notify: false,
    });
    const [review, setReview] = useState(false);

    useEffect(() => {
        if (wallet) {
            setReview(false);
            form.reset();
            form.clearErrors();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wallet?.id]);

    const balance = Number(wallet?.balance ?? 0);
    const amount = Number(form.data.amount || 0);
    const givenToday = Number(wallet?.withdrawn_today ?? 0);
    const limit =
        wallet?.daily_limit !== null && wallet?.daily_limit !== undefined
            ? Number(wallet.daily_limit)
            : null;
    const overLimit = limit !== null && givenToday + amount > limit;
    const insufficient = amount > balance;
    const quick = useMemo(
        () => [500, 1000, 2000, 5000].filter((q) => q <= balance),
        [balance],
    );

    if (!wallet) return null;

    const submit = (e: FormEvent) => {
        e.preventDefault();
        if (!review) return setReview(true);
        form.post(`/boarding/pocket-money/${wallet.id}/withdraw`, {
            preserveScroll: true,
            onSuccess: (page) => {
                onClose();
                offerReceipt(page);
            },
            onError: () => setReview(false),
        });
    };

    if (review) {
        return (
            <Modal open onClose={onClose} title="Confirm withdrawal" size="lg">
                <form onSubmit={submit}>
                    <Review
                        rows={[
                            [
                                "Student",
                                `${wallet.student} (${wallet.admission_no})`,
                            ],
                            [
                                "Amount to give",
                                <span className="text-danger">
                                    {money(amount, cur)}
                                </span>,
                            ],
                            [
                                "Purpose",
                                `${titleCase(form.data.category)}${form.data.description ? ` — ${form.data.description}` : ""}`,
                            ],
                            ["Balance now", money(balance, cur)],
                            ["Balance after", money(balance - amount, cur)],
                        ]}
                        note="Read the amount back to the student. Hand over the cash only after saving."
                        onBack={() => setReview(false)}
                        processing={form.processing}
                        confirmLabel="Confirm & hand over"
                        tone="danger"
                    />
                </form>
            </Modal>
        );
    }

    return (
        <Modal
            open
            onClose={onClose}
            title={`Give money to ${wallet.student}`}
            size="lg"
        >
            <form onSubmit={submit} className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-center text-sm">
                    <div className="rounded-md bg-success-light p-3 dark:bg-success-dark-light">
                        <div className="text-xs font-bold text-white-dark uppercase">
                            Available
                        </div>
                        <div className="text-lg font-extrabold text-success">
                            {money(balance, cur)}
                        </div>
                    </div>
                    <div className="rounded-md bg-info-light p-3 dark:bg-info-dark-light">
                        <div className="text-xs font-bold text-white-dark uppercase">
                            Given today
                        </div>
                        <div className="text-lg font-extrabold text-info">
                            {money(givenToday, cur)}
                        </div>
                    </div>
                    <div className="rounded-md bg-warning-light p-3 dark:bg-warning-dark-light">
                        <div className="text-xs font-bold text-white-dark uppercase">
                            Daily limit
                        </div>
                        <div className="text-lg font-extrabold text-warning">
                            {limit === null ? "None" : money(limit, cur)}
                        </div>
                    </div>
                </div>
                {quick.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {quick.map((q) => (
                            <button
                                key={q}
                                type="button"
                                className="btn btn-sm btn-outline-primary"
                                onClick={() =>
                                    form.setData("amount", String(q))
                                }
                            >
                                {money(q, "")}
                            </button>
                        ))}
                    </div>
                )}
                <FormGrid>
                    <Input
                        label={`Amount (${cur})`}
                        type="number"
                        min={1}
                        step="any"
                        required
                        value={form.data.amount}
                        onChange={(e) => form.setData("amount", e.target.value)}
                        error={
                            form.errors.amount ??
                            (insufficient
                                ? "More than the available balance."
                                : undefined)
                        }
                    />
                    <Select
                        label="Purpose"
                        options={categories.filter((c) => c.value !== "refund")}
                        value={form.data.category}
                        onChange={(e) =>
                            form.setData("category", e.target.value)
                        }
                        error={form.errors.category}
                    />
                </FormGrid>
                <Input
                    label="Details"
                    required={form.data.category === "other"}
                    placeholder="e.g. soap and toothpaste"
                    value={form.data.description}
                    onChange={(e) =>
                        form.setData("description", e.target.value)
                    }
                    error={form.errors.description}
                />
                <Input
                    label="Collected by (if not the student)"
                    value={form.data.counterparty}
                    onChange={(e) =>
                        form.setData("counterparty", e.target.value)
                    }
                    error={form.errors.counterparty}
                />
                {(overLimit || form.errors.limit_override_reason) && (
                    <Textarea
                        label="Reason for exceeding the daily limit"
                        required
                        rows={2}
                        placeholder="e.g. medical emergency — approved by the headmaster"
                        value={form.data.limit_override_reason}
                        onChange={(e) =>
                            form.setData(
                                "limit_override_reason",
                                e.target.value,
                            )
                        }
                        error={form.errors.limit_override_reason}
                    />
                )}
                {wallet.has_pin && (
                    <div className="rounded-md border border-info p-3">
                        <Input
                            label="Student's PIN (the student types it)"
                            type="password"
                            inputMode="numeric"
                            autoComplete="off"
                            required
                            maxLength={6}
                            value={form.data.pin}
                            onChange={(e) =>
                                form.setData(
                                    "pin",
                                    e.target.value.replace(/\D/g, ""),
                                )
                            }
                            error={form.errors.pin}
                            help="Proves the student requested this money."
                        />
                    </div>
                )}
                <Checkbox
                    label="Send the guardian an SMS"
                    checked={form.data.notify}
                    onChange={(e) => form.setData("notify", e.target.checked)}
                />
                <div className="flex justify-center gap-3">
                    <button
                        type="button"
                        className="btn btn-outline-dark"
                        onClick={onClose}
                    >
                        Cancel
                    </button>
                    <button
                        className="btn btn-danger"
                        disabled={
                            form.processing ||
                            insufficient ||
                            amount <= 0 ||
                            wallet.pin_locked
                        }
                    >
                        {wallet.pin_locked ? "PIN locked" : "Continue"}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

export async function reverseTxn(
    txn: Pick<Txn, "id" | "reference" | "amount">,
    currency: string,
) {
    const { confirmed, value } = await confirm({
        title: `Reverse ${txn.reference}?`,
        text: `A correcting entry of ${money(-Number(txn.amount), currency)} will be posted. The original stays on record. State why.`,
        input: "textarea",
        inputPlaceholder: "Reason (e.g. wrong student, amount mistyped)",
        confirmText: "Reverse",
        danger: true,
    });
    if (confirmed && value?.trim())
        router.post(
            `/boarding/pocket-money/transactions/${txn.id}/reverse`,
            { reason: value.trim() },
            { preserveScroll: true },
        );
}
