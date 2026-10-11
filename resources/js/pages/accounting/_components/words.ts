const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function chunk(n: number): string {
    const parts: string[] = [];
    if (n >= 100) {
        parts.push(`${ones[Math.floor(n / 100)]} Hundred`);
        n %= 100;
    }
    if (n >= 20) {
        parts.push(tens[Math.floor(n / 10)] + (n % 10 ? `-${ones[n % 10]}` : ''));
    } else if (n > 0) {
        parts.push(ones[n]);
    }
    return parts.join(' and ');
}

/** "Two Million Five Hundred Thousand Shillings Only" — used on printed vouchers. */
export function amountInWords(value: string | number, currencyWord = 'Shillings'): string {
    const total = Math.round(Number(value) * 100);
    let whole = Math.floor(total / 100);
    const cents = total % 100;
    if (!whole && !cents) return `Zero ${currencyWord} Only`;
    const scales = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];
    const words: string[] = [];
    let i = 0;
    while (whole > 0 && i < scales.length) {
        const c = whole % 1000;
        if (c) words.unshift(`${chunk(c)}${scales[i] ? ` ${scales[i]}` : ''}`);
        whole = Math.floor(whole / 1000);
        i++;
    }
    let out = `${words.join(' ')} ${currencyWord}`;
    if (cents) out += ` and ${chunk(cents)} Cents`;
    return `${out} Only`;
}
