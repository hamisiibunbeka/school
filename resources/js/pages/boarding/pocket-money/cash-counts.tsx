import { useForm } from "@inertiajs/react";
import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import DataTable, { type Column } from "@/components/ui/data-table";
import { FormGrid, Input, Select } from "@/components/ui/form";
import Modal from "@/components/ui/modal";
import PageHeader from "@/components/ui/page-header";
import { useCan } from "@/hooks/use-can";
import { cn, dateTime, money, num } from "@/lib/utils";
import type { Paginated } from "@/types";
import {
    PocketNav,
    useCurrency,
    type CustodianOption,
} from "./_components/shared";

type Count = {
    id: number;
    counted_at: string;
    custodian: string | null;
    accounts: number;
    expected: string;
    counted: string;
    variance: string;
    handed_over_to: string | null;
    notes: string | null;
    recorded_by: string | null;
};

function Variance({ value }: { value: string | number }) {
    const cur = useCurrency();
    const n = Number(value);
    if (n === 0)
        return <span className="badge badge-soft-success">Balanced</span>;
    return (
        <span
            className={cn("font-bold", n < 0 ? "text-danger" : "text-warning")}
        >
            {n < 0 ? `Short ${money(-n, cur)}` : `Over ${money(n, cur)}`}
        </span>
    );
}

export default function PocketMoneyCashCounts({
    counts,
    custodians,
}: {
    counts: Paginated<Count>;
    custodians: CustodianOption[];
}) {
    const can = useCan();
    const manage = can("boarding.manage");
    const cur = useCurrency();
    const [open, setOpen] = useState(false);
    const form = useForm({
        custodian_id: "",
        counted: "",
        handed_over_to: "",
        notes: "",
    });
    const custodian = custodians.find(
        (c) => String(c.value) === form.data.custodian_id,
    );
    const variance =
        form.data.counted === "" || !custodian
            ? null
            : Number(form.data.counted) - Number(custodian.held);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post("/boarding/pocket-money/cash-counts", {
            preserveScroll: true,
            onSuccess: () => setOpen(false),
        });
    };

    const columns: Column<Count>[] = [
        {
            key: "when",
            header: "Counted",
            render: (c) => dateTime(c.counted_at),
        },
        {
            key: "custodian",
            header: "Custodian",
            render: (c) => (
                <span className="font-semibold">{c.custodian ?? "—"}</span>
            ),
        },
        {
            key: "accounts",
            header: "Wallets",
            align: "right",
            render: (c) => num(c.accounts),
        },
        {
            key: "expected",
            header: "System says",
            align: "right",
            render: (c) => money(c.expected, cur),
        },
        {
            key: "counted",
            header: "Cash counted",
            align: "right",
            render: (c) => money(c.counted, cur),
        },
        {
            key: "variance",
            header: "Result",
            align: "right",
            render: (c) => <Variance value={c.variance} />,
        },
        {
            key: "handover",
            header: "Handover / notes",
            render: (c) => (
                <div className="text-sm">
                    {c.handed_over_to && (
                        <div className="font-semibold text-info">
                            → handed to {c.handed_over_to}
                        </div>
                    )}
                    {c.notes && (
                        <div className="text-xs text-white-dark">{c.notes}</div>
                    )}
                    <div className="text-xs text-white-dark">
                        by {c.recorded_by ?? "—"}
                    </div>
                </div>
            ),
        },
    ];

    return (
        <>
            <PageHeader
                title="Pocket Money — Cash Counts"
                subtitle="Count the physical cash a patron/matron holds and compare it with the system. Use the handover option at shift changes so responsibility moves with the cash."
                breadcrumbs={[
                    { title: "Boarding", href: "/boarding/dormitories" },
                    { title: "Pocket Money", href: "/boarding/pocket-money" },
                    { title: "Cash counts" },
                ]}
                actions={
                    manage && (
                        <button
                            className="btn btn-primary"
                            onClick={() => {
                                form.reset();
                                form.clearErrors();
                                setOpen(true);
                            }}
                        >
                            <Plus className="h-4 w-4" /> New cash count
                        </button>
                    )
                }
            />

            <PocketNav active="cash-counts" />

            <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {custodians
                    .filter((c) => c.wallets > 0)
                    .map((c) => (
                        <div key={c.value} className="panel">
                            <div className="text-xs font-bold tracking-wide text-white-dark uppercase">
                                {c.label}
                            </div>
                            <div className="text-xl font-extrabold text-black dark:text-white-light">
                                {money(c.held, cur)}
                            </div>
                            <div className="text-xs text-white-dark">
                                should be on hand · {num(c.wallets)} wallets
                            </div>
                        </div>
                    ))}
            </div>

            <div className="panel">
                <DataTable
                    columns={columns}
                    paginated={counts}
                    empty="No cash counts yet"
                    emptyDescription="Count the cash at least daily, and always when custody changes hands."
                />
            </div>

            <Modal
                open={open}
                onClose={() => setOpen(false)}
                title="Cash count"
                size="lg"
            >
                <form onSubmit={submit} className="space-y-4">
                    <FormGrid>
                        <Select
                            label="Custodian being counted"
                            required
                            options={custodians}
                            value={form.data.custodian_id}
                            onChange={(e) =>
                                form.setData("custodian_id", e.target.value)
                            }
                            error={form.errors.custodian_id}
                        />
                        <Input
                            label={`Cash physically counted (${cur})`}
                            type="number"
                            min={0}
                            step="any"
                            required
                            value={form.data.counted}
                            onChange={(e) =>
                                form.setData("counted", e.target.value)
                            }
                            error={form.errors.counted}
                        />
                    </FormGrid>
                    {custodian && (
                        <div className="grid grid-cols-2 gap-3 rounded-md bg-primary-light p-3 text-sm dark:bg-primary-dark-light">
                            <div>
                                System balance ({num(custodian.wallets)}{" "}
                                wallets): <b>{money(custodian.held, cur)}</b>
                            </div>
                            <div className="text-end">
                                {variance !== null && (
                                    <Variance value={variance} />
                                )}
                            </div>
                        </div>
                    )}
                    <Select
                        label="Hand over custody to (optional)"
                        placeholder="No handover — just a count"
                        options={custodians.filter(
                            (c) => String(c.value) !== form.data.custodian_id,
                        )}
                        value={form.data.handed_over_to}
                        onChange={(e) =>
                            form.setData("handed_over_to", e.target.value)
                        }
                        error={form.errors.handed_over_to}
                        help="All of this custodian's wallets move to the receiver, who becomes accountable for the cash from now on."
                    />
                    <Input
                        label="Notes"
                        placeholder="Explain any shortage/excess"
                        value={form.data.notes}
                        onChange={(e) => form.setData("notes", e.target.value)}
                        error={form.errors.notes}
                    />
                    <div className="flex justify-center gap-3">
                        <button
                            type="button"
                            className="btn btn-outline-dark"
                            onClick={() => setOpen(false)}
                        >
                            Cancel
                        </button>
                        <button
                            className="btn btn-primary"
                            disabled={form.processing}
                        >
                            Record count
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
