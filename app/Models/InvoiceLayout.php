<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A school's own invoice layout (its customised copy of a claimed sample). */
class InvoiceLayout extends SchoolModel
{
    protected function casts(): array
    {
        return ['layout' => 'array'];
    }

    public function template(): BelongsTo
    {
        return $this->belongsTo(InvoiceTemplate::class, 'invoice_template_id');
    }

    public function editor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
