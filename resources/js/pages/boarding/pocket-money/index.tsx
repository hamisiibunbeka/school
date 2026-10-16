import { Link } from "@inertiajs/react";
import {
    ArrowDownLeft,
    ArrowUpRight,
    FileText,
    HandCoins,
    PiggyBank,
    Plus,
    ShieldCheck,
    Wallet,
} from "lucide-react";
import { useState } from "react";
import { IconButton, IconLink } from "@/components/ui/actions";
import Avatar from "@/components/ui/avatar";
import DataTable, { type Column } from "@/components/ui/data-table";
import {
    FilterBar,
    FilterSelect,
    SearchInput,
    useFilters,
} from "@/components/ui/filters";
import PageHeader from "@/components/ui/page-header";
import StatCard from "@/components/ui/stat-card";
import { useCan } from "@/hooks/use-can";
import { dateTime, money, num } from "@/lib/utils";
import type { Option, Paginated } from "@/types";
import {
    DepositModal,
    PinBadge,
    PocketNav,
    useCurrency,
    WithdrawModal,
    type CustodianOption,
    type StudentOption,
    type WalletRow,
} from "./_components/shared";

type Props = {
    accounts: Paginated<WalletRow>;
    filters: { search: string; custodian: string; status: string };
    stats: {
        held: string;
        my_custody: string;
        wallets: number;
        empty: number;
        deposits_today: string;
        withdrawals_today: string;
        transactions_today: number;
    };
    students: StudentOption[];
    custodians: CustodianOption[];
    categories: Option[];
    methods: Option[];
};

export default function PocketMoneyIndex({
    accounts,
    filters: initial,
    stats,
    students,
    custodians,
    categories,
    methods,
}: Props) {
    const can = useCan();
    const manage = can("boarding.manage");
    const cur = useCurrency();
    const { filters, setFilter, reset } = useFilters(initial);
    const [deposit, setDeposit] = useState<{
        open: boolean;
        studentId: number | null;
    }>({ open: false, studentId: null });
    const [withdraw, setWithdraw] = useState<WalletRow | null>(null);

    const columns: Column<WalletRow>[] = [
        {
            key: "student",
            header: "Student",
            render: (w) => (
                <Link
                    href={`/boarding/pocket-money/${w.id}`}
                    className="flex items-center gap-3"
                >
                    <Avatar name={w.student} src={w.photo_url} />
                    <div>
                        <div className="font-bold text-black hover:text-primary dark:text-white-light">
                            {w.student}
                        </div>
                        <div className="text-xs text-white-dark">
                            {w.admission_no}
                            {w.class ? ` · ${w.class}` : ""}
                        </div>
                    </div>
                </Link>
            ),
        },
        {
            key: "balance",
            header: "Balance",
            align: "right",
            render: (w) => (
                <span
                    className={
                        Number(w.balance) > 0
                            ? "text-base font-extrabold text-black dark:text-white-light"
                            : "font-bold text-danger"
                    }
                >
                    {money(w.balance, cur)}
                </span>
            ),
        },
        {
            key: "today",
            header: "Given today",
            align: "right",
            render: (w) => (
                <div>
                    <div>{money(w.withdrawn_today ?? 0, cur)}</div>
                    {w.daily_limit !== null && (
                        <div className="text-xs text-white-dark">
                            limit {money(w.daily_limit, cur)}
                        </div>
                    )}
                </div>
            ),
        },
        {
            key: "custodian",
            header: "Kept by",
            render: (w) =>
                w.custodian ?? <span className="text-white-dark">—</span>,
        },
        {
            key: "activity",
            header: "Last activity",
            render: (w) => (
                <div className="flex flex-col items-start gap-1">
                    <span className="text-sm">
                        {w.last_activity ? dateTime(w.last_activity) : "—"}
                    </span>
                    <span className="flex gap-1">
                        <PinBadge wallet={w} />
                        {w.status === "closed" && (
                            <span className="badge badge-soft-dark">
                                Closed
                            </span>
                        )}
                    </span>
                </div>
            ),
        },
        {
            key: "actions",
            header: "",
            align: "right",
            render: (w) => (
                <div className="flex justify-end gap-1">
                    {manage && w.status === "active" && (
                        <>
                            <IconButton
                                icon={ArrowDownLeft}
                                title="Receive money"
                                className="text-success"
                                onClick={() =>
                                    setDeposit({
                                        open: true,
                                        studentId: w.student_id,
                                    })
                                }
                            />
                            <IconButton
                                icon={ArrowUpRight}
                                title="Give money"
                                className="text-danger"
                                onClick={() => setWithdraw(w)}
                            />
                        </>
                    )}
                    <IconLink
                        href={`/boarding/pocket-money/${w.id}`}
                        icon={FileText}
                        title="Statement"
                    />
                </div>
            ),
        },
    ];

    return (
        <>
            <PageHeader
                title="Pocket Money"
                subtitle="Money boarders leave with the patron/matron, given out on demand — every shilling numbered, receipted and balanced."
                breadcrumbs={[
                    { title: "Boarding", href: "/boarding/dormitories" },
                    { title: "Pocket Money" },
                ]}
                actions={
                    manage && (
                        <button
                            className="btn btn-success"
                            onClick={() =>
                                setDeposit({ open: true, studentId: null })
                            }
                        >
                            <Plus className="h-4 w-4" /> Receive money
                        </button>
                    )
                }
            />

            <PocketNav active="wallets" />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard
                    title="Total held for students"
                    value={money(stats.held, cur)}
                    icon={PiggyBank}
                    tone="primary"
                    hint={`${num(stats.wallets)} active wallets`}
                />
                <StatCard
                    title="In my custody"
                    value={money(stats.my_custody, cur)}
                    icon={ShieldCheck}
                    tone="info"
                    hint="Cash you should have on hand"
                />
                <StatCard
                    title="Received today"
                    value={money(stats.deposits_today, cur)}
                    icon={ArrowDownLeft}
                    tone="success"
                    hint={`${num(stats.transactions_today)} transactions today`}
                />
                <StatCard
                    title="Given out today"
                    value={money(stats.withdrawals_today, cur)}
                    icon={HandCoins}
                    tone="warning"
                    hint={`${num(stats.empty)} wallets empty`}
                />
            </div>

            <div className="panel">
                <FilterBar
                    actions={
                        Object.values(filters).some(Boolean) && (
                            <button
                                type="button"
                                className="btn btn-sm btn-outline-dark"
                                onClick={reset}
                            >
                                Clear filters
                            </button>
                        )
                    }
                >
                    <SearchInput
                        value={filters.search}
                        onChange={(v) => setFilter("search", v)}
                        placeholder="Search student, admission no…"
                    />
                    <FilterSelect
                        value={filters.custodian}
                        onChange={(v) => setFilter("custodian", v)}
                        options={custodians}
                        placeholder="All custodians"
                    />
                    <FilterSelect
                        value={filters.status}
                        onChange={(v) => setFilter("status", v)}
                        options={[
                            { value: "empty", label: "Empty wallets" },
                            { value: "locked", label: "PIN locked" },
                            { value: "closed", label: "Closed wallets" },
                        ]}
                        placeholder="Active wallets"
                    />
                </FilterBar>
                <DataTable
                    columns={columns}
                    paginated={accounts}
                    empty="No pocket money wallets yet"
                    emptyDescription="A wallet opens automatically the first time money is received for a boarder."
                />
            </div>

            {manage && (
                <>
                    <DepositModal
                        open={deposit.open}
                        studentId={deposit.studentId}
                        onClose={() =>
                            setDeposit({ open: false, studentId: null })
                        }
                        students={students}
                        methods={methods}
                    />
                    <WithdrawModal
                        wallet={withdraw}
                        onClose={() => setWithdraw(null)}
                        categories={categories}
                    />
                </>
            )}

            <div className="mt-6 panel flex items-start gap-3 text-sm text-white-dark">
                <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                    <b className="text-black dark:text-white-light">
                        How this avoids disputes:
                    </b>{" "}
                    every deposit and withdrawal gets a reference number and the
                    balance after it; nothing can be edited or deleted (mistakes
                    are reversed with a reason); students can protect
                    withdrawals with a PIN; daily limits stop the money running
                    out early; and regular cash counts prove the cash on hand
                    matches the system.
                </div>
            </div>
        </>
    );
}
