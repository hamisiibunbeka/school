<?php

namespace App\Support\InvoiceLayouts;

use Illuminate\Support\Str;

/**
 * The invoice layout format shared by the sample library, the school designer and the printed invoice.
 *
 * A layout is `{ version, page, blocks[] }`. Blocks flow in order across a 12-column grid (`width` = columns),
 * so reordering the list rearranges the page. Every block can be hidden, relabelled and restyled; `fields`
 * switch individual lines on or off and `labels` rename them. Mirrors resources/js/components/invoice-layout/schema.ts.
 */
class InvoiceLayoutSchema
{
    public const FONTS = [
        'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Nunito', 'Work Sans', 'Raleway', 'Ubuntu', 'IBM Plex Sans',
        'Merriweather', 'Playfair Display', 'Lora', 'Source Serif 4', 'Roboto Slab', 'Courier Prime', 'Arial', 'Georgia', 'Times New Roman',
    ];

    public const PAPERS = ['A4', 'A5', 'Letter'];

    public const WIDTHS = [12, 8, 6, 4];

    /** Default options per block type. `fields`/`labels` are the block's switchable, renamable lines. */
    public static function blockDefaults(string $type): array
    {
        $common = ['label' => '', 'visible' => true, 'width' => 12, 'align' => 'left', 'fontSize' => 13, 'bold' => false, 'color' => '', 'background' => '', 'border' => false, 'padding' => 0, 'fields' => [], 'labels' => [], 'options' => []];

        $specific = match ($type) {
            'letterhead' => ['fields' => ['logo' => true, 'name' => true, 'motto' => true, 'address' => true, 'contacts' => true, 'registration' => false], 'options' => ['style' => 'left']],
            'title' => ['fontSize' => 18, 'bold' => true, 'align' => 'center', 'options' => ['text' => 'Fee Invoice', 'subtitle' => '']],
            'meta' => [
                'fields' => ['invoice_no' => true, 'issue_date' => true, 'due_date' => true, 'period' => true, 'status' => true],
                'labels' => ['invoice_no' => 'Invoice No', 'issue_date' => 'Issue date', 'due_date' => 'Due date', 'period' => 'Period', 'status' => 'Status'],
                'options' => ['layout' => 'list'],
            ],
            'bill_to' => [
                'label' => 'Bill to',
                'fields' => ['name' => true, 'admission_no' => true, 'class' => true, 'residence' => true, 'guardian' => true, 'guardian_phone' => true],
                'labels' => ['admission_no' => 'Adm. No', 'class' => 'Class', 'residence' => 'Residence', 'guardian' => 'Parent/Guardian', 'guardian_phone' => 'Phone'],
            ],
            'amount_due' => ['label' => 'Amount due', 'options' => ['style' => 'box']],
            'items' => [
                'fields' => ['index' => true, 'description' => true, 'category' => true, 'amount' => true, 'discount' => true, 'net' => true],
                'labels' => ['index' => '#', 'description' => 'Description', 'category' => 'Category', 'amount' => 'Amount', 'discount' => 'Discount', 'net' => 'Net'],
                'options' => ['style' => 'lined', 'header' => 'accent'],
            ],
            'totals' => [
                'fields' => ['subtotal' => true, 'discount' => true, 'total' => true, 'paid' => true, 'balance' => true, 'account_balance' => false],
                'labels' => ['subtotal' => 'Subtotal', 'discount' => 'Discounts', 'total' => 'Invoice total', 'paid' => 'Paid', 'balance' => 'Balance due', 'account_balance' => 'Total outstanding on account'],
            ],
            'amount_words' => ['label' => 'Amount in words', 'options' => ['basis' => 'balance']],
            'payments' => ['label' => 'Payments received'],
            'instructions' => ['label' => 'How to pay', 'fields' => ['banks' => true, 'mobile' => true, 'reference' => true]],
            'notes' => ['label' => 'Notes'],
            'signatures' => ['options' => ['slots' => ['Bursar / Accountant', 'Head of School'], 'stamp' => true]],
            'text' => ['label' => 'Custom section', 'options' => ['text' => '']],
            'footer' => ['fontSize' => 11, 'fields' => ['issued_by' => true, 'generated' => true, 'printed_at' => false], 'options' => ['text' => '']],
            'divider' => ['options' => ['style' => 'solid', 'thickness' => 1]],
            'spacer' => ['options' => ['height' => 16]],
            default => null,
        };

        return $specific === null ? [] : array_replace($common, $specific);
    }

    public static function types(): array
    {
        return ['letterhead', 'title', 'meta', 'bill_to', 'amount_due', 'items', 'totals', 'amount_words', 'payments', 'instructions', 'notes', 'signatures', 'text', 'footer', 'divider', 'spacer'];
    }

    public static function pageDefaults(): array
    {
        return ['font' => 'Inter', 'fontSize' => 13, 'accent' => '#4361ee', 'text' => '#1f2937', 'paper' => 'A4', 'margin' => 14, 'border' => 'none', 'accentBar' => 'none', 'headingCase' => 'upper', 'stamp' => true];
    }

    /** A complete block of the given type with overrides applied (used to author the samples). */
    public static function block(string $type, array $overrides = []): array
    {
        $block = self::blockDefaults($type);
        foreach (['fields', 'labels', 'options'] as $key) {
            if (isset($overrides[$key])) {
                $overrides[$key] = array_replace($block[$key], $overrides[$key]);
            }
        }

        return ['id' => $type.'-'.Str::lower(Str::random(6)), 'type' => $type] + array_replace($block, $overrides);
    }

    /**
     * Clean a layout coming from the designer: unknown types/keys are dropped and every value is clamped,
     * so a saved layout always renders.
     */
    public static function sanitize(array $layout): array
    {
        $pageIn = is_array($layout['page'] ?? null) ? $layout['page'] : [];
        $d = self::pageDefaults();
        $page = [
            'font' => in_array($pageIn['font'] ?? null, self::FONTS, true) ? $pageIn['font'] : $d['font'],
            'fontSize' => self::int($pageIn['fontSize'] ?? null, 9, 18, $d['fontSize']),
            'accent' => self::color($pageIn['accent'] ?? null) ?: $d['accent'],
            'text' => self::color($pageIn['text'] ?? null) ?: $d['text'],
            'paper' => in_array($pageIn['paper'] ?? null, self::PAPERS, true) ? $pageIn['paper'] : $d['paper'],
            'margin' => self::int($pageIn['margin'] ?? null, 5, 30, $d['margin']),
            'border' => in_array($pageIn['border'] ?? null, ['none', 'thin', 'thick', 'double'], true) ? $pageIn['border'] : $d['border'],
            'accentBar' => in_array($pageIn['accentBar'] ?? null, ['none', 'top', 'left'], true) ? $pageIn['accentBar'] : $d['accentBar'],
            'headingCase' => in_array($pageIn['headingCase'] ?? null, ['upper', 'normal'], true) ? $pageIn['headingCase'] : $d['headingCase'],
            'stamp' => (bool) ($pageIn['stamp'] ?? $d['stamp']),
        ];

        $blocks = [];
        $ids = [];
        foreach (array_slice(is_array($layout['blocks'] ?? null) ? $layout['blocks'] : [], 0, 60) as $in) {
            $type = is_array($in) ? ($in['type'] ?? null) : null;
            if (! is_string($type) || ! in_array($type, self::types(), true)) {
                continue;
            }
            $def = self::blockDefaults($type);
            $id = is_string($in['id'] ?? null) && preg_match('/^[\w-]{1,40}$/', $in['id']) && ! isset($ids[$in['id']]) ? $in['id'] : $type.'-'.Str::lower(Str::random(6));
            $ids[$id] = true;

            $blocks[] = [
                'id' => $id,
                'type' => $type,
                'label' => self::str($in['label'] ?? $def['label'], 120),
                'visible' => (bool) ($in['visible'] ?? true),
                'width' => in_array((int) ($in['width'] ?? 12), self::WIDTHS, true) ? (int) $in['width'] : 12,
                'align' => in_array($in['align'] ?? null, ['left', 'center', 'right'], true) ? $in['align'] : $def['align'],
                'fontSize' => self::int($in['fontSize'] ?? null, 8, 40, $def['fontSize']),
                'bold' => (bool) ($in['bold'] ?? $def['bold']),
                'color' => self::color($in['color'] ?? null),
                'background' => self::color($in['background'] ?? null),
                'border' => (bool) ($in['border'] ?? false),
                'padding' => self::int($in['padding'] ?? null, 0, 40, 0),
                'fields' => self::switches($def['fields'], $in['fields'] ?? []),
                'labels' => self::texts($def['labels'], $in['labels'] ?? []),
                'options' => self::options($type, $def['options'], is_array($in['options'] ?? null) ? $in['options'] : []),
            ];
        }

        return ['version' => 1, 'page' => $page, 'blocks' => $blocks];
    }

    private static function options(string $type, array $def, array $in): array
    {
        $pick = fn (string $key, array $allowed) => in_array($in[$key] ?? null, $allowed, true) ? $in[$key] : $def[$key];

        return match ($type) {
            'letterhead' => ['style' => $pick('style', ['left', 'center', 'right'])],
            'title' => ['text' => self::str($in['text'] ?? $def['text'], 120), 'subtitle' => self::str($in['subtitle'] ?? '', 200)],
            'meta' => ['layout' => $pick('layout', ['list', 'grid', 'inline'])],
            'amount_due' => ['style' => $pick('style', ['box', 'plain', 'outline'])],
            'items' => ['style' => $pick('style', ['lined', 'striped', 'boxed', 'minimal']), 'header' => $pick('header', ['accent', 'light', 'plain'])],
            'amount_words' => ['basis' => $pick('basis', ['balance', 'total'])],
            'signatures' => [
                'slots' => array_values(array_slice(array_map(fn ($s) => self::str($s, 60), array_filter(is_array($in['slots'] ?? null) ? $in['slots'] : $def['slots'], 'is_string')), 0, 4)),
                'stamp' => (bool) ($in['stamp'] ?? $def['stamp']),
            ],
            'text' => ['text' => self::str($in['text'] ?? '', 2000)],
            'footer' => ['text' => self::str($in['text'] ?? '', 300)],
            'divider' => ['style' => $pick('style', ['solid', 'dashed', 'dotted', 'double']), 'thickness' => self::int($in['thickness'] ?? null, 1, 6, 1)],
            'spacer' => ['height' => self::int($in['height'] ?? null, 4, 120, 16)],
            default => [],
        };
    }

    private static function switches(array $def, mixed $in): array
    {
        $in = is_array($in) ? $in : [];

        return array_map(fn ($v) => (bool) $v, array_replace($def, array_intersect_key($in, $def)));
    }

    private static function texts(array $def, mixed $in): array
    {
        $in = is_array($in) ? $in : [];
        $out = [];
        foreach ($def as $key => $value) {
            $out[$key] = isset($in[$key]) && is_string($in[$key]) ? self::str($in[$key], 60) : $value;
        }

        return $out;
    }

    private static function str(mixed $v, int $max): string
    {
        return is_string($v) ? mb_substr(trim(strip_tags($v)), 0, $max) : '';
    }

    private static function int(mixed $v, int $min, int $max, int $default): int
    {
        return is_numeric($v) ? max($min, min($max, (int) $v)) : $default;
    }

    private static function color(mixed $v): string
    {
        return is_string($v) && preg_match('/^#[0-9a-fA-F]{6}$/', $v) ? strtolower($v) : '';
    }
}
