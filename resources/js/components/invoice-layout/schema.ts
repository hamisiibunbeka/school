/**
 * Invoice layout format — mirrors app/Support/InvoiceLayouts/InvoiceLayoutSchema.php (the server sanitises
 * everything the designer saves against that class).
 */

export type BlockType =
    | 'letterhead'
    | 'title'
    | 'meta'
    | 'bill_to'
    | 'amount_due'
    | 'items'
    | 'totals'
    | 'amount_words'
    | 'payments'
    | 'instructions'
    | 'notes'
    | 'signatures'
    | 'text'
    | 'footer'
    | 'divider'
    | 'spacer';

export type Block = {
    id: string;
    type: BlockType;
    label: string;
    visible: boolean;
    width: 12 | 8 | 6 | 4;
    align: 'left' | 'center' | 'right';
    fontSize: number;
    bold: boolean;
    color: string;
    background: string;
    border: boolean;
    padding: number;
    fields: Record<string, boolean>;
    labels: Record<string, string>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options: Record<string, any>;
};

export type PageSettings = {
    font: string;
    fontSize: number;
    accent: string;
    text: string;
    paper: 'A4' | 'A5' | 'Letter';
    margin: number;
    border: 'none' | 'thin' | 'thick' | 'double';
    accentBar: 'none' | 'top' | 'left';
    headingCase: 'upper' | 'normal';
    stamp: boolean;
};

export type Layout = { version: number; page: PageSettings; blocks: Block[] };

export type InvoiceData = {
    school: { name: string; motto: string | null; logo_url: string | null; address: string | null; phone: string | null; email: string | null; registration_no: string | null };
    currency: string;
    invoice: {
        invoice_no: string;
        issue_date: string | null;
        due_date: string | null;
        period: string;
        status: string;
        overdue: boolean;
        subtotal: string;
        discount: string;
        total: string;
        paid: string;
        balance: string;
        total_words: string;
        balance_words: string;
        notes: string | null;
        created_by: string | null;
        items: { description: string; category: string | null; amount: string; discount: string; net: string }[];
        payments: { receipt_no: string | null; payment_date: string | null; method: string | null; amount: string }[];
    };
    student: {
        full_name: string;
        admission_no: string;
        class: string;
        residence_type: string;
        guardian: { name: string; phone: string | null } | null;
        account_balance: string;
    } | null;
    instructions: { banks: { bank: string; account_name: string; account_no: string | null }[]; mobile: { provider: string; number: string | null; name: string }[]; note: string };
};

/** What each block is, for the "add block" menu and the property panel. */
export const BLOCK_CATALOG: Record<BlockType, { name: string; hint: string }> = {
    letterhead: { name: 'Letterhead', hint: 'Logo, school name, motto, address and contacts' },
    title: { name: 'Title', hint: 'Document title, e.g. “Fee Invoice”' },
    meta: { name: 'Invoice details', hint: 'Invoice number, dates, period, status' },
    bill_to: { name: 'Bill to', hint: 'Student and parent details' },
    amount_due: { name: 'Amount due', hint: 'Highlighted balance to pay' },
    items: { name: 'Fee items table', hint: 'What is being charged' },
    totals: { name: 'Totals', hint: 'Subtotal, discounts, paid, balance' },
    amount_words: { name: 'Amount in words', hint: 'Balance or total written out' },
    payments: { name: 'Payments received', hint: 'Receipts applied to this invoice' },
    instructions: { name: 'How to pay', hint: 'Bank and mobile-money details' },
    notes: { name: 'Invoice notes', hint: 'Notes typed on the invoice' },
    signatures: { name: 'Signatures & stamp', hint: 'Signature lines and an official stamp box' },
    text: { name: 'Custom text', hint: 'Your own labelled section — rules, reminders, bank slip…' },
    footer: { name: 'Footer', hint: 'Issued by, generated note, your own line' },
    divider: { name: 'Divider line', hint: 'A horizontal rule' },
    spacer: { name: 'Space', hint: 'Empty vertical space' },
};

/** Field (line) names shown in the property panel. */
export const FIELD_NAMES: Record<string, string> = {
    logo: 'Logo',
    name: 'Name',
    motto: 'Motto',
    address: 'Address',
    contacts: 'Phone & email',
    registration: 'Registration no.',
    invoice_no: 'Invoice number',
    issue_date: 'Issue date',
    due_date: 'Due date',
    period: 'Term / period',
    status: 'Status',
    admission_no: 'Admission number',
    class: 'Class',
    residence: 'Residence',
    guardian: 'Parent / guardian',
    guardian_phone: 'Parent phone',
    index: 'Row number',
    description: 'Description',
    category: 'Category',
    amount: 'Amount',
    discount: 'Discount',
    net: 'Net',
    subtotal: 'Subtotal',
    total: 'Invoice total',
    paid: 'Paid',
    balance: 'Balance due',
    account_balance: 'Account outstanding',
    banks: 'Bank accounts',
    mobile: 'Mobile money',
    reference: 'Payment reference line',
    issued_by: 'Issued by',
    generated: '“Computer-generated” note',
    printed_at: 'Printed date',
};

const COMMON = { label: '', visible: true, width: 12 as const, align: 'left' as const, fontSize: 13, bold: false, color: '', background: '', border: false, padding: 0, fields: {}, labels: {}, options: {} };

const SPECIFIC: Record<BlockType, Partial<Block>> = {
    letterhead: { fields: { logo: true, name: true, motto: true, address: true, contacts: true, registration: false }, options: { style: 'left' } },
    title: { fontSize: 18, bold: true, align: 'center', options: { text: 'Fee Invoice', subtitle: '' } },
    meta: {
        fields: { invoice_no: true, issue_date: true, due_date: true, period: true, status: true },
        labels: { invoice_no: 'Invoice No', issue_date: 'Issue date', due_date: 'Due date', period: 'Period', status: 'Status' },
        options: { layout: 'list' },
    },
    bill_to: {
        label: 'Bill to',
        fields: { name: true, admission_no: true, class: true, residence: true, guardian: true, guardian_phone: true },
        labels: { admission_no: 'Adm. No', class: 'Class', residence: 'Residence', guardian: 'Parent/Guardian', guardian_phone: 'Phone' },
    },
    amount_due: { label: 'Amount due', options: { style: 'box' } },
    items: {
        fields: { index: true, description: true, category: true, amount: true, discount: true, net: true },
        labels: { index: '#', description: 'Description', category: 'Category', amount: 'Amount', discount: 'Discount', net: 'Net' },
        options: { style: 'lined', header: 'accent' },
    },
    totals: {
        fields: { subtotal: true, discount: true, total: true, paid: true, balance: true, account_balance: false },
        labels: { subtotal: 'Subtotal', discount: 'Discounts', total: 'Invoice total', paid: 'Paid', balance: 'Balance due', account_balance: 'Total outstanding on account' },
    },
    amount_words: { label: 'Amount in words', options: { basis: 'balance' } },
    payments: { label: 'Payments received' },
    instructions: { label: 'How to pay', fields: { banks: true, mobile: true, reference: true } },
    notes: { label: 'Notes' },
    signatures: { options: { slots: ['Bursar / Accountant', 'Head of School'], stamp: true } },
    text: { label: 'Custom section', options: { text: 'Type your text here…' } },
    footer: { fontSize: 11, fields: { issued_by: true, generated: true, printed_at: false }, options: { text: '' } },
    divider: { options: { style: 'solid', thickness: 1 } },
    spacer: { options: { height: 16 } },
};

export function newBlock(type: BlockType): Block {
    const s = SPECIFIC[type];
    return {
        ...COMMON,
        ...s,
        id: `${type}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        fields: { ...(s.fields ?? {}) },
        labels: { ...(s.labels ?? {}) },
        options: structuredClone(s.options ?? {}),
    } as Block;
}

export const SYSTEM_FONTS = ['Arial', 'Georgia', 'Times New Roman'];
const SERIF = ['Merriweather', 'Playfair Display', 'Lora', 'Source Serif 4', 'Roboto Slab', 'Georgia', 'Times New Roman'];

export function fontStack(font: string): string {
    if (font === 'Courier Prime') return `'Courier Prime', 'Courier New', monospace`;
    return `'${font}', ${SERIF.includes(font) ? 'Georgia, serif' : 'Arial, Helvetica, sans-serif'}`;
}

export const PAPER_WIDTH_MM: Record<PageSettings['paper'], number> = { A4: 210, A5: 148, Letter: 216 };
export const PAPER_HEIGHT_MM: Record<PageSettings['paper'], number> = { A4: 297, A5: 210, Letter: 279 };

/** #rrggbb + alpha (0–1) → #rrggbbaa */
export function tint(hex: string, alpha: number): string {
    const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
        .toString(16)
        .padStart(2, '0');
    return /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${a}` : hex;
}
