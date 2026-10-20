<?php

namespace App\Support\InvoiceLayouts;

use App\Models\InvoiceTemplate;
use App\Support\InvoiceLayouts\InvoiceLayoutSchema as S;

/**
 * The platform's sample invoice layouts. Schools pick one (it then becomes exclusive to them) and customise
 * their own copy. `sync()` upserts the samples by code, so new samples reach existing installations.
 */
class InvoiceLayoutLibrary
{
    /** @return array<string, array{name:string, description:string, layout:array}> */
    public static function all(): array
    {
        $b = fn (string $type, array $o = []) => S::block($type, $o);
        $page = fn (array $o) => array_replace(S::pageDefaults(), $o);

        $samples = [
            'classic-blue' => ['Classic Blue', 'Clean letterhead, details side by side and a full fee table. A safe all-rounder.',
                $page(['font' => 'Inter', 'accent' => '#1d4ed8', 'accentBar' => 'top']), [
                    $b('letterhead', ['width' => 8]),
                    $b('meta', ['width' => 4, 'align' => 'right', 'fontSize' => 12]),
                    $b('divider', ['options' => ['thickness' => 2]]),
                    $b('title'),
                    $b('bill_to', ['width' => 6]),
                    $b('amount_due', ['width' => 6, 'align' => 'right']),
                    $b('items'),
                    $b('payments', ['width' => 6, 'fontSize' => 12]),
                    $b('totals', ['width' => 6]),
                    $b('instructions'),
                    $b('notes', ['fontSize' => 12]),
                    $b('footer'),
                ]],

            'modern-minimal' => ['Modern Minimal', 'Lots of white space, a big left-aligned title and hairline tables.',
                $page(['font' => 'Work Sans', 'accent' => '#111827', 'headingCase' => 'normal', 'stamp' => false]), [
                    $b('title', ['align' => 'left', 'fontSize' => 30, 'options' => ['text' => 'Invoice']]),
                    $b('letterhead', ['width' => 6, 'fontSize' => 12, 'fields' => ['logo' => false, 'motto' => false]]),
                    $b('meta', ['width' => 6, 'align' => 'right', 'fontSize' => 12, 'options' => ['layout' => 'list']]),
                    $b('spacer', ['options' => ['height' => 20]]),
                    $b('bill_to', ['width' => 6, 'fields' => ['residence' => false]]),
                    $b('amount_due', ['width' => 6, 'align' => 'right', 'options' => ['style' => 'plain'], 'fontSize' => 15]),
                    $b('items', ['fields' => ['category' => false], 'options' => ['style' => 'minimal', 'header' => 'plain']]),
                    $b('totals', ['width' => 6]),
                    $b('amount_words', ['width' => 6, 'fontSize' => 12]),
                    $b('instructions', ['fontSize' => 12]),
                    $b('footer', ['fields' => ['issued_by' => false]]),
                ]],

            'elegant-serif' => ['Elegant Serif', 'Centred crest, serif type and a double page border for a traditional feel.',
                $page(['font' => 'Playfair Display', 'accent' => '#7c2d12', 'border' => 'double', 'margin' => 18]), [
                    $b('letterhead', ['align' => 'center', 'options' => ['style' => 'center']]),
                    $b('divider', ['options' => ['style' => 'double', 'thickness' => 3]]),
                    $b('title', ['fontSize' => 22, 'options' => ['text' => 'Statement of Fees']]),
                    $b('meta', ['align' => 'center', 'options' => ['layout' => 'inline'], 'fontSize' => 12]),
                    $b('bill_to', ['width' => 6]),
                    $b('amount_due', ['width' => 6, 'align' => 'right', 'options' => ['style' => 'outline']]),
                    $b('items', ['options' => ['style' => 'lined', 'header' => 'plain']]),
                    $b('amount_words', ['width' => 6]),
                    $b('totals', ['width' => 6]),
                    $b('instructions', ['fontSize' => 12]),
                    $b('signatures'),
                    $b('footer', ['align' => 'center']),
                ]],

            'bold-band' => ['Bold Header Band', 'A full-width coloured header band with white text — strong and modern.',
                $page(['font' => 'Poppins', 'accent' => '#4f46e5']), [
                    $b('letterhead', ['width' => 8, 'background' => '#4f46e5', 'color' => '#ffffff', 'padding' => 18]),
                    $b('title', ['width' => 4, 'align' => 'right', 'background' => '#4f46e5', 'color' => '#ffffff', 'padding' => 18, 'fontSize' => 22, 'options' => ['text' => 'Invoice']]),
                    $b('spacer'),
                    $b('bill_to', ['width' => 4]),
                    $b('meta', ['width' => 4]),
                    $b('amount_due', ['width' => 4, 'align' => 'right']),
                    $b('items', ['options' => ['style' => 'striped', 'header' => 'accent']]),
                    $b('payments', ['width' => 6]),
                    $b('totals', ['width' => 6]),
                    $b('instructions'),
                    $b('footer'),
                ]],

            'corporate-grey' => ['Corporate Grey', 'Boxed sections and grid tables in neutral greys — business-like.',
                $page(['font' => 'Roboto', 'accent' => '#374151', 'border' => 'thin']), [
                    $b('letterhead', ['width' => 8]),
                    $b('title', ['width' => 4, 'align' => 'right', 'fontSize' => 20, 'options' => ['text' => 'Tax-Free Fee Invoice']]),
                    $b('meta', ['border' => true, 'padding' => 10, 'options' => ['layout' => 'grid']]),
                    $b('bill_to', ['width' => 6, 'border' => true, 'padding' => 10]),
                    $b('amount_due', ['width' => 6, 'border' => true, 'padding' => 10, 'options' => ['style' => 'plain'], 'align' => 'right']),
                    $b('items', ['options' => ['style' => 'boxed', 'header' => 'light']]),
                    $b('payments', ['width' => 6, 'border' => true, 'padding' => 10]),
                    $b('totals', ['width' => 6, 'border' => true, 'padding' => 10]),
                    $b('instructions', ['border' => true, 'padding' => 10]),
                    $b('signatures', ['options' => ['slots' => ['Prepared by', 'Approved by'], 'stamp' => false]]),
                    $b('footer'),
                ]],

            'emerald-academy' => ['Emerald Academy', 'Green accent bar down the left edge with rounded summary boxes.',
                $page(['font' => 'Nunito', 'accent' => '#047857', 'accentBar' => 'left']), [
                    $b('letterhead'),
                    $b('title', ['align' => 'left', 'options' => ['text' => 'School Fee Invoice']]),
                    $b('meta', ['width' => 6]),
                    $b('bill_to', ['width' => 6, 'background' => '#ecfdf5', 'padding' => 12]),
                    $b('items', ['options' => ['style' => 'striped', 'header' => 'accent']]),
                    $b('amount_words', ['width' => 6, 'background' => '#ecfdf5', 'padding' => 12]),
                    $b('totals', ['width' => 6]),
                    $b('instructions'),
                    $b('notes'),
                    $b('footer'),
                ]],

            'royal-purple' => ['Royal Purple', 'Purple title ribbon and generous spacing for prestige schools.',
                $page(['font' => 'Montserrat', 'accent' => '#6d28d9']), [
                    $b('letterhead', ['align' => 'center', 'options' => ['style' => 'center']]),
                    $b('title', ['background' => '#6d28d9', 'color' => '#ffffff', 'padding' => 10, 'fontSize' => 16]),
                    $b('bill_to', ['width' => 6]),
                    $b('meta', ['width' => 6, 'align' => 'right']),
                    $b('items', ['options' => ['style' => 'lined', 'header' => 'light']]),
                    $b('payments', ['width' => 6]),
                    $b('totals', ['width' => 6, 'background' => '#f5f3ff', 'padding' => 12]),
                    $b('amount_due', ['options' => ['style' => 'box'], 'align' => 'center']),
                    $b('instructions'),
                    $b('signatures', ['options' => ['slots' => ['Bursar', 'Principal']]]),
                    $b('footer', ['align' => 'center']),
                ]],

            'sunrise-orange' => ['Sunrise Orange', 'Warm orange headings and striped rows — friendly for primary schools.',
                $page(['font' => 'Poppins', 'accent' => '#ea580c', 'accentBar' => 'top']), [
                    $b('letterhead', ['width' => 8]),
                    $b('amount_due', ['width' => 4, 'align' => 'right']),
                    $b('title', ['align' => 'left']),
                    $b('bill_to', ['width' => 6, 'background' => '#fff7ed', 'padding' => 12]),
                    $b('meta', ['width' => 6, 'background' => '#fff7ed', 'padding' => 12]),
                    $b('items', ['options' => ['style' => 'striped', 'header' => 'accent']]),
                    $b('totals', ['width' => 6]),
                    $b('payments', ['width' => 6]),
                    $b('instructions'),
                    $b('footer'),
                ]],

            'ocean-teal' => ['Ocean Teal', 'Cool teal palette, details on the right and a compact table.',
                $page(['font' => 'Open Sans', 'accent' => '#0f766e']), [
                    $b('letterhead', ['width' => 6]),
                    $b('meta', ['width' => 6, 'align' => 'right', 'options' => ['layout' => 'list']]),
                    $b('divider', ['options' => ['thickness' => 3]]),
                    $b('bill_to', ['width' => 8]),
                    $b('amount_due', ['width' => 4, 'align' => 'right', 'options' => ['style' => 'outline']]),
                    $b('items', ['fontSize' => 12, 'options' => ['style' => 'lined', 'header' => 'accent']]),
                    $b('amount_words', ['width' => 6]),
                    $b('totals', ['width' => 6]),
                    $b('instructions', ['background' => '#f0fdfa', 'padding' => 12]),
                    $b('footer'),
                ]],

            'crimson-crest' => ['Crimson Crest', 'Centred crest with crimson accents and signature lines for the bursar and head.',
                $page(['font' => 'Merriweather', 'accent' => '#b91c1c', 'border' => 'thin']), [
                    $b('letterhead', ['align' => 'center', 'options' => ['style' => 'center'], 'fields' => ['registration' => true]]),
                    $b('divider', ['options' => ['thickness' => 2]]),
                    $b('title'),
                    $b('meta', ['align' => 'center', 'options' => ['layout' => 'inline'], 'fontSize' => 12]),
                    $b('bill_to'),
                    $b('items', ['options' => ['style' => 'boxed', 'header' => 'accent']]),
                    $b('amount_words', ['width' => 6]),
                    $b('totals', ['width' => 6]),
                    $b('instructions', ['fontSize' => 12]),
                    $b('signatures'),
                    $b('footer', ['align' => 'center']),
                ]],

            'ink-saver' => ['Ink Saver Monochrome', 'Black and white only, no filled areas — cheapest to print in bulk.',
                $page(['font' => 'Arial', 'accent' => '#000000', 'stamp' => false]), [
                    $b('letterhead', ['width' => 8, 'fields' => ['logo' => false]]),
                    $b('meta', ['width' => 4, 'align' => 'right', 'fontSize' => 11]),
                    $b('divider'),
                    $b('title', ['fontSize' => 15]),
                    $b('bill_to', ['width' => 6]),
                    $b('amount_due', ['width' => 6, 'align' => 'right', 'options' => ['style' => 'outline']]),
                    $b('items', ['options' => ['style' => 'boxed', 'header' => 'plain']]),
                    $b('totals', ['width' => 6]),
                    $b('payments', ['width' => 6]),
                    $b('instructions', ['fontSize' => 11]),
                    $b('footer'),
                ]],

            'kilimanjaro' => ['Kilimanjaro', 'Forest green with a golden summary panel — inspired by the mountain.',
                $page(['font' => 'Lato', 'accent' => '#166534', 'accentBar' => 'top']), [
                    $b('letterhead', ['width' => 8]),
                    $b('title', ['width' => 4, 'align' => 'right', 'options' => ['text' => 'Fee Invoice']]),
                    $b('bill_to', ['width' => 6]),
                    $b('meta', ['width' => 6, 'align' => 'right']),
                    $b('items', ['options' => ['style' => 'lined', 'header' => 'accent']]),
                    $b('payments', ['width' => 6]),
                    $b('totals', ['width' => 6, 'background' => '#fef3c7', 'padding' => 12]),
                    $b('amount_words', ['background' => '#fef3c7', 'padding' => 10]),
                    $b('instructions'),
                    $b('footer'),
                ]],

            'serengeti-earth' => ['Serengeti Earth', 'Earthy browns on a cream panel with a serif body.',
                $page(['font' => 'Lora', 'accent' => '#92400e']), [
                    $b('letterhead', ['background' => '#fffbeb', 'padding' => 14]),
                    $b('title', ['align' => 'left', 'fontSize' => 20]),
                    $b('meta', ['width' => 4]),
                    $b('bill_to', ['width' => 4]),
                    $b('amount_due', ['width' => 4, 'align' => 'right']),
                    $b('items', ['options' => ['style' => 'striped', 'header' => 'light']]),
                    $b('amount_words', ['width' => 6]),
                    $b('totals', ['width' => 6]),
                    $b('instructions', ['background' => '#fffbeb', 'padding' => 12]),
                    $b('footer'),
                ]],

            'zanzibar-coral' => ['Zanzibar Coral', 'Deep sea blue with a coral “amount due” card.',
                $page(['font' => 'Raleway', 'accent' => '#0e7490']), [
                    $b('letterhead', ['width' => 6]),
                    $b('amount_due', ['width' => 6, 'align' => 'right', 'background' => '#ffe4e6', 'padding' => 14, 'options' => ['style' => 'plain'], 'color' => '#be123c']),
                    $b('title', ['align' => 'left']),
                    $b('meta', ['options' => ['layout' => 'grid']]),
                    $b('bill_to'),
                    $b('items', ['options' => ['style' => 'lined', 'header' => 'accent']]),
                    $b('totals', ['width' => 6]),
                    $b('payments', ['width' => 6]),
                    $b('instructions'),
                    $b('footer'),
                ]],

            'compact-a5' => ['Compact A5', 'Half-page A5 slip with only the essentials — two invoices per A4 sheet.',
                $page(['font' => 'Inter', 'fontSize' => 11, 'accent' => '#2563eb', 'paper' => 'A5', 'margin' => 8]), [
                    $b('letterhead', ['width' => 8, 'fontSize' => 11, 'fields' => ['motto' => false, 'address' => false]]),
                    $b('title', ['width' => 4, 'align' => 'right', 'fontSize' => 14, 'options' => ['text' => 'Invoice']]),
                    $b('meta', ['fontSize' => 10, 'options' => ['layout' => 'inline'], 'fields' => ['status' => false]]),
                    $b('bill_to', ['fontSize' => 11, 'fields' => ['guardian' => false, 'guardian_phone' => false, 'residence' => false]]),
                    $b('items', ['fontSize' => 10, 'fields' => ['category' => false, 'discount' => false], 'options' => ['style' => 'minimal', 'header' => 'light']]),
                    $b('totals', ['fontSize' => 11, 'fields' => ['subtotal' => false, 'discount' => false]]),
                    $b('instructions', ['fontSize' => 10, 'fields' => ['mobile' => false]]),
                ]],

            'ledger-lined' => ['Ledger Lined', 'Typewriter type, dashed rules and boxed tables — like a bursar’s ledger.',
                $page(['font' => 'Courier Prime', 'accent' => '#1f2937', 'border' => 'thin', 'stamp' => false]), [
                    $b('letterhead', ['fields' => ['logo' => false]]),
                    $b('divider', ['options' => ['style' => 'dashed']]),
                    $b('title', ['options' => ['text' => 'Fee Invoice / Bill']]),
                    $b('meta', ['width' => 6]),
                    $b('bill_to', ['width' => 6]),
                    $b('divider', ['options' => ['style' => 'dashed']]),
                    $b('items', ['options' => ['style' => 'boxed', 'header' => 'plain']]),
                    $b('totals', ['width' => 6]),
                    $b('amount_words', ['width' => 6]),
                    $b('divider', ['options' => ['style' => 'dashed']]),
                    $b('instructions'),
                    $b('signatures', ['options' => ['slots' => ['Received by', 'Bursar'], 'stamp' => true]]),
                ]],

            'formal-certificate' => ['Formal Certificate', 'Navy double border, centred text and an official stamp box.',
                $page(['font' => 'Source Serif 4', 'accent' => '#1e3a8a', 'border' => 'double', 'margin' => 20]), [
                    $b('letterhead', ['align' => 'center', 'options' => ['style' => 'center'], 'fields' => ['registration' => true]]),
                    $b('title', ['fontSize' => 24, 'options' => ['text' => 'Official Fee Invoice', 'subtitle' => 'Issued under the school fees policy']]),
                    $b('meta', ['align' => 'center', 'options' => ['layout' => 'inline']]),
                    $b('bill_to', ['align' => 'center', 'label' => 'Issued to']),
                    $b('items', ['options' => ['style' => 'lined', 'header' => 'light']]),
                    $b('totals', ['width' => 6]),
                    $b('amount_words', ['width' => 6]),
                    $b('instructions'),
                    $b('signatures', ['options' => ['slots' => ['Bursar', 'Head of School'], 'stamp' => true]]),
                    $b('footer', ['align' => 'center']),
                ]],

            'two-column-split' => ['Two-Column Split', 'School on the left, invoice details in a coloured column on the right.',
                $page(['font' => 'IBM Plex Sans', 'accent' => '#be185d']), [
                    $b('letterhead', ['width' => 6]),
                    $b('meta', ['width' => 6, 'background' => '#fdf2f8', 'padding' => 14, 'label' => 'Invoice', 'options' => ['layout' => 'list']]),
                    $b('bill_to', ['width' => 6]),
                    $b('amount_due', ['width' => 6, 'align' => 'right']),
                    $b('items', ['options' => ['style' => 'striped', 'header' => 'accent']]),
                    $b('instructions', ['width' => 6, 'fontSize' => 12]),
                    $b('totals', ['width' => 6]),
                    $b('footer'),
                ]],

            'sidebar-accent' => ['Sidebar Accent', 'Thick blue edge bar, amount due top-right and a narrow details column.',
                $page(['font' => 'Ubuntu', 'accent' => '#2563eb', 'accentBar' => 'left']), [
                    $b('letterhead', ['width' => 8]),
                    $b('amount_due', ['width' => 4, 'align' => 'right']),
                    $b('title', ['align' => 'left', 'fontSize' => 16]),
                    $b('items', ['width' => 8, 'fields' => ['category' => false], 'options' => ['style' => 'lined', 'header' => 'light']]),
                    $b('meta', ['width' => 4, 'background' => '#eff6ff', 'padding' => 12]),
                    $b('bill_to', ['width' => 6]),
                    $b('totals', ['width' => 6]),
                    $b('instructions'),
                    $b('footer'),
                ]],

            'ankara-bilingual' => ['Ankara (Kiswahili / English)', 'Bilingual Kiswahili–English labels throughout, for parents who prefer Kiswahili.',
                $page(['font' => 'Nunito', 'accent' => '#15803d', 'accentBar' => 'top']), [
                    $b('letterhead', ['width' => 8]),
                    $b('meta', ['width' => 4, 'align' => 'right', 'fontSize' => 12, 'labels' => ['invoice_no' => 'Namba / No', 'issue_date' => 'Tarehe / Date', 'due_date' => 'Mwisho / Due', 'period' => 'Muhula / Term', 'status' => 'Hali / Status']]),
                    $b('title', ['options' => ['text' => 'Ankara ya Ada / Fee Invoice']]),
                    $b('bill_to', ['width' => 6, 'label' => 'Kwa / Bill to', 'labels' => ['admission_no' => 'Namba ya usajili', 'class' => 'Kidato / Class', 'residence' => 'Makazi', 'guardian' => 'Mzazi / Mlezi', 'guardian_phone' => 'Simu']]),
                    $b('amount_due', ['width' => 6, 'align' => 'right', 'label' => 'Kiasi kinachodaiwa / Amount due']),
                    $b('items', ['labels' => ['index' => 'Na.', 'description' => 'Maelezo / Description', 'category' => 'Aina', 'amount' => 'Kiasi', 'discount' => 'Punguzo', 'net' => 'Jumla']]),
                    $b('payments', ['width' => 6, 'label' => 'Malipo yaliyopokelewa']),
                    $b('totals', ['width' => 6, 'labels' => ['subtotal' => 'Jumla ndogo', 'discount' => 'Punguzo', 'total' => 'Jumla ya ankara', 'paid' => 'Kilicholipwa', 'balance' => 'Salio / Balance due']]),
                    $b('instructions', ['label' => 'Jinsi ya kulipa / How to pay']),
                    $b('footer', ['options' => ['text' => 'Asante kwa kulipa ada kwa wakati. Thank you for paying on time.']]),
                ]],
        ];

        $out = [];
        foreach ($samples as $code => [$name, $description, $pageConfig, $blocks]) {
            // Stable ids so re-syncing the library doesn't churn the stored layouts.
            foreach ($blocks as $i => &$block) {
                $block['id'] = $block['type'].'-'.($i + 1);
            }
            unset($block);
            $out[$code] = ['name' => $name, 'description' => $description, 'layout' => S::sanitize(['page' => $pageConfig, 'blocks' => $blocks])];
        }

        return $out;
    }

    /** Insert new samples and refresh the design of existing ones (schools keep their own copies). */
    public static function sync(): void
    {
        $order = 0;
        foreach (self::all() as $code => $sample) {
            $template = InvoiceTemplate::firstOrNew(['code' => $code]);
            $template->fill(['name' => $sample['name'], 'description' => $sample['description'], 'layout' => $sample['layout'], 'sort_order' => ++$order]);
            $template->is_active ??= true;
            $template->save();
        }
    }
}
