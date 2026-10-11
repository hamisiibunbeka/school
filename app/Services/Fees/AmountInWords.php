<?php

namespace App\Services\Fees;

/** Converts money amounts to English words for receipts (no intl extension needed). */
class AmountInWords
{
    private const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
        'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];

    private const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

    private const SCALES = ['', 'thousand', 'million', 'billion', 'trillion'];

    public static function convert(string|int|float $amount, string $currency = 'TZS'): string
    {
        $amount = bcadd((string) $amount, '0', 2);
        [$whole, $cents] = explode('.', ltrim($amount, '-'));

        $unit = match (strtoupper($currency)) {
            'TZS', 'KES', 'UGX' => ['shillings', 'cents'],
            'USD' => ['dollars', 'cents'],
            default => [strtoupper($currency), 'cents'],
        };

        $words = self::integer((int) $whole);
        $text = ucfirst($words).' '.$unit[0];

        if ((int) $cents > 0) {
            $text .= ' and '.self::integer((int) $cents).' '.$unit[1];
        }

        return $text.' only';
    }

    public static function integer(int $n): string
    {
        if ($n === 0) {
            return 'zero';
        }

        $parts = [];
        $scale = 0;

        while ($n > 0) {
            $chunk = $n % 1000;
            if ($chunk > 0) {
                $parts[] = trim(self::hundreds($chunk).' '.self::SCALES[$scale]);
            }
            $n = intdiv($n, 1000);
            $scale++;
        }

        return implode(' ', array_reverse($parts));
    }

    private static function hundreds(int $n): string
    {
        $words = [];
        if ($n >= 100) {
            $words[] = self::ONES[intdiv($n, 100)].' hundred';
            $n %= 100;
            if ($n > 0) {
                $words[] = 'and';
            }
        }

        if ($n >= 20) {
            $words[] = self::TENS[intdiv($n, 10)].($n % 10 ? '-'.self::ONES[$n % 10] : '');
        } elseif ($n > 0) {
            $words[] = self::ONES[$n];
        }

        return implode(' ', $words);
    }
}
