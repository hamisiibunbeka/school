import { Link } from "@inertiajs/react";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "@/components/ui/actions";
import Letterhead from "@/components/ui/letterhead";
import PageHeader from "@/components/ui/page-header";
import { dateTime, money, titleCase } from "@/lib/utils";
import { Signature } from "../../accounting/_components/shared";
import { amountInWords } from "../../accounting/_components/words";
import { useCurrency, type Txn } from "./_components/shared";

type Slip = Txn & {
    student: string;
    admission_no: string;
    class: string;
    account_id: number;
    custodian: string | null;
    reversal_of: string | null;
};

function Copy({ t, copy }: { t: Slip; copy: string }) {
    const cur = useCurrency();
    const amount = Math.abs(Number(t.amount));
    const title =
        t.type === "deposit"
            ? "Pocket money received"
            : t.type === "reversal"
              ? "Pocket money correction"
              : t.category === "refund"
                ? "Pocket money refund"
                : "Pocket money paid out";
    const rows: [string, string | null][] = [
        ["Student", `${t.student} (${t.admission_no})`],
        ["Class", t.class || null],
        ["Date & time", dateTime(t.transacted_at)],
        [
            t.type === "deposit" ? "Received from" : "Collected by",
            t.counterparty ?? (t.type === "withdrawal" ? t.student : null),
        ],
        ["Method", t.method ? titleCase(t.method) : null],
        ["Purpose", t.category ? titleCase(t.category) : null],
        ["Details", t.description],
        ["Reverses", t.reversal_of],
        ["Confirmed with PIN", t.pin_verified ? "Yes" : null],
    ];

    return (
        <div className="panel break-inside-avoid">
            <Letterhead
                title={title}
                meta={
                    <>
                        <div className="font-mono text-base font-extrabold">
                            {t.reference}
                        </div>
                        <div className="font-bold uppercase">{copy}</div>
                    </>
                }
            />
            <table className="w-full text-sm">
                <tbody>
                    {rows
                        .filter(([, v]) => v)
                        .map(([k, v]) => (
                            <tr key={k}>
                                <td className="w-44 py-1 font-semibold text-white-dark">
                                    {k}
                                </td>
                                <td className="py-1 font-semibold text-black dark:text-white-light">
                                    {v}
                                </td>
                            </tr>
                        ))}
                </tbody>
            </table>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4 rounded-md border-2 border-dashed border-primary p-4">
                <div>
                    <div className="text-xs font-bold text-white-dark uppercase">
                        Amount
                    </div>
                    <div className="text-2xl font-extrabold text-black dark:text-white-light">
                        {money(amount, cur)}
                    </div>
                    <div className="text-xs text-white-dark italic">
                        {amountInWords(amount)} only
                    </div>
                </div>
                <div className="text-end">
                    <div className="text-xs font-bold text-white-dark uppercase">
                        Balance after
                    </div>
                    <div className="text-xl font-extrabold text-primary">
                        {money(t.balance_after, cur)}
                    </div>
                </div>
            </div>
            {t.reversed && (
                <p className="mt-3 text-center font-bold text-danger uppercase">
                    This transaction has been reversed
                </p>
            )}
            <div className="mt-10 grid grid-cols-2 gap-10 text-xs">
                <Signature
                    label="Student"
                    name={t.student}
                    sub={
                        t.type === "deposit"
                            ? "Handed over the cash"
                            : "Received the cash"
                    }
                />
                <Signature
                    label="Patron / Matron"
                    name={t.recorded_by}
                    sub="Recorded the transaction"
                />
            </div>
        </div>
    );
}

export default function PocketMoneyReceipt({
    transaction,
}: {
    transaction: Slip;
}) {
    return (
        <>
            <PageHeader
                title={`Slip ${transaction.reference}`}
                breadcrumbs={[
                    { title: "Boarding", href: "/boarding/dormitories" },
                    { title: "Pocket Money", href: "/boarding/pocket-money" },
                    { title: transaction.reference },
                ]}
                actions={
                    <>
                        <Link
                            href={`/boarding/pocket-money/${transaction.account_id}`}
                            className="btn btn-outline-dark no-print"
                        >
                            <ArrowLeft className="h-4 w-4" /> Statement
                        </Link>
                        <PrintButton label="Print slip" />
                    </>
                }
            />
            <div className="mx-auto max-w-3xl space-y-6">
                <Copy t={transaction} copy="Student copy" />
                <div className="print-only border-t-2 border-dashed border-white-dark" />
                <Copy t={transaction} copy="Office copy" />
            </div>
        </>
    );
}
