<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class JournalLine extends SchoolModel
{
    protected function casts(): array
    {
        return ['debit' => 'decimal:2', 'credit' => 'decimal:2'];
    }

    public function journal(): BelongsTo
    {
        return $this->belongsTo(Journal::class);
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }
}
