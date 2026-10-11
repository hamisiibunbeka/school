<?php

namespace App\Services\Inventory;

use App\Models\Account;
use App\Models\InventoryItem;
use App\Models\PurchaseOrder;
use App\Models\StockMovement;
use App\Services\Accounting\LedgerService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Stock engine for the stores module (SRS 4.15).
 *
 * Every stock change goes through here: the item row is locked, quantity
 * and weighted-average cost are recalculated with bcmath and a ledger line
 * (stock_movements) is written with the running balance. Financial impact
 * is posted to the general ledger through LedgerService where possible;
 * a ledger failure (no fiscal year, closed period, missing account) never
 * blocks the physical stock record — it is reported back to the caller.
 */
class StockService
{
    /** Last ledger posting problem (null when everything posted). */
    public ?string $ledgerWarning = null;

    public function __construct(private LedgerService $ledger) {}

    /**
     * Goods in at a given cost; recalculates the weighted average cost.
     *
     * @param  array<string, mixed>  $attributes  date, reference, purchase_order_id, notes, type (receipt|adjustment|return)
     */
    public function receive(InventoryItem $item, string $quantity, string $unitCost, array $attributes = []): StockMovement
    {
        if (bccomp($quantity, '0', 2) <= 0) {
            throw ValidationException::withMessages(['quantity' => 'Received quantity must be greater than zero.']);
        }

        return DB::transaction(function () use ($item, $quantity, $unitCost, $attributes) {
            $locked = InventoryItem::whereKey($item->id)->lockForUpdate()->firstOrFail();
            $onHand = (string) $locked->quantity;
            $newQty = bcadd($onHand, $quantity, 2);

            // Weighted average: (existing value + incoming value) / new quantity.
            if (bccomp($onHand, '0', 2) <= 0 || bccomp($newQty, '0', 2) <= 0) {
                $avg = $unitCost;
            } else {
                $value = bcadd(bcmul($onHand, (string) $locked->unit_cost, 4), bcmul($quantity, $unitCost, 4), 4);
                $avg = $this->round(bcdiv($value, $newQty, 6));
            }

            $locked->forceFill(['quantity' => $newQty, 'unit_cost' => $avg])->save();
            $item->setRawAttributes($locked->getAttributes(), true);

            $type = in_array($attributes['type'] ?? null, ['adjustment', 'return'], true) ? $attributes['type'] : 'receipt';

            return $this->writeMovement($locked, $type, $quantity, $unitCost, $newQty, $attributes);
        });
    }

    /**
     * Any non-receipt movement. Quantity is signed (+ in, - out); valued at average cost.
     *
     * @param  array<string, mixed>  $attributes  date, reference, issued_to, notes
     */
    public function move(InventoryItem $item, string $type, string $quantity, array $attributes = [], bool $allowNegative = false): StockMovement
    {
        if (! in_array($type, ['issue', 'adjustment', 'return', 'write_off'], true)) {
            throw ValidationException::withMessages(['type' => 'Unsupported movement type.']);
        }
        if (bccomp($quantity, '0', 2) === 0) {
            throw ValidationException::withMessages(['quantity' => 'Quantity cannot be zero.']);
        }

        return DB::transaction(function () use ($item, $type, $quantity, $attributes, $allowNegative) {
            $locked = InventoryItem::whereKey($item->id)->lockForUpdate()->firstOrFail();
            $newQty = bcadd((string) $locked->quantity, $quantity, 2);

            if (bccomp($newQty, '0', 2) < 0 && ! $allowNegative) {
                throw ValidationException::withMessages([
                    'quantity' => "Insufficient stock: only {$this->fmt($locked->quantity)} {$locked->unit} of {$locked->name} on hand.",
                ]);
            }

            $locked->forceFill(['quantity' => $newQty])->save();
            $item->setRawAttributes($locked->getAttributes(), true);

            return $this->writeMovement($locked, $type, $quantity, (string) $locked->unit_cost, $newQty, $attributes);
        });
    }

    /**
     * Receive goods against an approved purchase order (full or partial).
     *
     * @param  array<int, string|float|int>  $quantities  purchase_order_item_id => quantity received now
     * @return array<int, StockMovement>
     */
    public function receivePurchaseOrder(PurchaseOrder $order, array $quantities, string $date, ?string $notes = null, bool $post = true): array
    {
        if ($order->status !== 'approved') {
            throw ValidationException::withMessages(['status' => 'Only approved purchase orders can be received.']);
        }

        return DB::transaction(function () use ($order, $quantities, $date, $notes, $post) {
            $order = PurchaseOrder::whereKey($order->id)->lockForUpdate()->firstOrFail();
            $order->load('items.item', 'supplier');
            $movements = [];
            $total = '0.00';

            foreach ($order->items as $line) {
                $qty = $this->round((string) ($quantities[$line->id] ?? '0'));
                if (bccomp($qty, '0', 2) <= 0) {
                    continue;
                }
                if (bccomp($qty, $line->outstanding(), 2) > 0) {
                    throw ValidationException::withMessages([
                        "lines.{$line->id}" => "Cannot receive more than the outstanding {$this->fmt($line->outstanding())} for {$line->item?->name}.",
                    ]);
                }

                $movements[] = $this->receive($line->item, $qty, (string) $line->unit_cost, [
                    'date' => $date,
                    'reference' => $order->po_no,
                    'purchase_order_id' => $order->id,
                    'notes' => $notes ?: "Goods received from {$order->supplier?->name}",
                ]);

                $line->forceFill(['received_quantity' => bcadd((string) $line->received_quantity, $qty, 2)])->save();
                $total = bcadd($total, bcmul($qty, (string) $line->unit_cost, 2), 2);
            }

            if (! $movements) {
                throw ValidationException::withMessages(['lines' => 'Enter a quantity for at least one line.']);
            }

            $complete = $order->items->every(fn ($l) => bccomp((string) $l->received_quantity, (string) $l->quantity, 2) >= 0);
            if ($complete) {
                $order->forceFill(['status' => 'received'])->save();
            }

            if ($post) {
                $this->postJournal($date, "Goods received {$order->po_no} — {$order->supplier?->name}", $order->po_no, [
                    ['code' => '1400', 'debit' => $total],
                    ['code' => '2100', 'credit' => $total],
                ], $order);
            }

            return $movements;
        });
    }

    /** Post the GL entry for a non-receipt movement (issue / return / adjustment / write-off). */
    public function postMovement(StockMovement $movement): void
    {
        $value = bcmul(ltrim((string) $movement->quantity, '-'), (string) $movement->unit_cost, 2);
        if (bccomp($value, '0', 2) <= 0) {
            return;
        }
        $outflow = bccomp((string) $movement->quantity, '0', 2) < 0;
        $item = $movement->item;

        $counter = match ($movement->type) {
            'issue', 'return' => self::expenseAccountFor($movement->issued_to),
            default => '6900',
        };
        $label = match ($movement->type) {
            'issue' => 'Stores issue',
            'return' => 'Stores return',
            'write_off' => 'Stock write-off',
            default => 'Stock adjustment',
        };

        $lines = $outflow
            ? [['code' => $counter, 'debit' => $value], ['code' => '1400', 'credit' => $value]]
            : [['code' => '1400', 'debit' => $value], ['code' => $counter, 'credit' => $value]];

        $this->postJournal(
            $movement->date->toDateString(),
            trim("{$label}: {$item?->name}".($movement->issued_to ? " — {$movement->issued_to}" : '')),
            $movement->reference,
            $lines,
            $movement,
        );
    }

    /** Simple mapping of "issued to" to an expense account code. */
    public static function expenseAccountFor(?string $issuedTo): string
    {
        $t = strtolower((string) $issuedTo);

        return match (true) {
            str_contains($t, 'kitchen') || str_contains($t, 'dining') || str_contains($t, 'boarding') => '5100',
            str_contains($t, 'lab') || str_contains($t, 'class') || str_contains($t, 'form') || str_contains($t, 'academic') || str_contains($t, 'science') => '5120',
            str_contains($t, 'sport') || str_contains($t, 'games') => '6800',
            str_contains($t, 'transport') || str_contains($t, 'bus') => '6310',
            str_contains($t, 'maint') || str_contains($t, 'clean') || str_contains($t, 'ground') => '6300',
            default => '6400',
        };
    }

    /**
     * Record + post a journal by account codes. Failures are swallowed and
     * exposed via $ledgerWarning so stock records are never lost.
     *
     * @param  array<int, array{code: string, debit?: string, credit?: string}>  $lines
     */
    public function postJournal(string $date, string $narration, ?string $reference, array $lines, $source = null): bool
    {
        $this->ledgerWarning = null;

        try {
            $resolved = [];
            foreach ($lines as $line) {
                $account = Account::byCode($line['code']);
                if (! $account) {
                    throw new \RuntimeException("Account {$line['code']} not found in the chart of accounts.");
                }
                $resolved[] = array_filter([
                    'account_id' => $account->id,
                    'debit' => $line['debit'] ?? null,
                    'credit' => $line['credit'] ?? null,
                ], fn ($v) => $v !== null);
            }

            $this->ledger->record(
                ['date' => $date, 'narration' => mb_substr($narration, 0, 250), 'type' => 'inventory', 'reference' => $reference],
                $resolved,
                $source,
            );

            return true;
        } catch (Throwable $e) {
            $message = $e instanceof ValidationException ? collect($e->errors())->flatten()->first() : $e->getMessage();
            $this->ledgerWarning = (string) $message;
            Log::warning('Inventory ledger posting skipped: '.$message);

            return false;
        }
    }

    /** @param  array<string, mixed>  $attributes */
    private function writeMovement(InventoryItem $item, string $type, string $quantity, string $unitCost, string $balance, array $attributes): StockMovement
    {
        return StockMovement::create([
            'inventory_item_id' => $item->id,
            'type' => $type,
            'quantity' => $quantity,
            'unit_cost' => $unitCost,
            'balance_after' => $balance,
            'date' => $attributes['date'] ?? now()->toDateString(),
            'reference' => $attributes['reference'] ?? null,
            'purchase_order_id' => $attributes['purchase_order_id'] ?? null,
            'issued_to' => $attributes['issued_to'] ?? null,
            'notes' => $attributes['notes'] ?? null,
            'user_id' => $attributes['user_id'] ?? auth()->id(),
        ]);
    }

    private function round(string $value): string
    {
        // Round half-up to 2 decimals using bcmath.
        $neg = str_starts_with($value, '-');
        $abs = ltrim($value, '-');
        $rounded = bcadd($abs, '0.005', 2);

        return $neg && bccomp($rounded, '0', 2) !== 0 ? '-'.$rounded : $rounded;
    }

    private function fmt(string|float|null $v): string
    {
        return rtrim(rtrim(number_format((float) $v, 2, '.', ','), '0'), '.');
    }
}
