<?php

namespace App\Http\Controllers;

use App\Imports\BookImporter;
use App\Imports\ClassImporter;
use App\Imports\DepartmentImporter;
use App\Imports\EmployeeImporter;
use App\Imports\FormFiveSelectionImporter;
use App\Imports\GuardianImporter;
use App\Imports\Importer;
use App\Imports\InventoryItemImporter;
use App\Imports\Spreadsheet;
use App\Imports\StreamImporter;
use App\Imports\StudentImporter;
use App\Imports\SubjectImporter;
use App\Imports\SupplierImporter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Spreadsheet imports (SRS 4.2 bulk import / 14 data migration):
 * template download → upload & preview (dry run, per-row errors, duplicates) → commit.
 */
class ImportController extends Controller
{
    /** @var array<string, class-string<Importer>> */
    public const IMPORTERS = [
        'students' => StudentImporter::class,
        'guardians' => GuardianImporter::class,
        'employees' => EmployeeImporter::class,
        'departments' => DepartmentImporter::class,
        'subjects' => SubjectImporter::class,
        'classes' => ClassImporter::class,
        'streams' => StreamImporter::class,
        'books' => BookImporter::class,
        'inventory-items' => InventoryItemImporter::class,
        'suppliers' => SupplierImporter::class,
        'form-five-selection' => FormFiveSelectionImporter::class,
    ];

    public function template(Request $request, string $type): BinaryFileResponse
    {
        $importer = $this->importer($request, $type);
        [$columns, $rows, $instructions] = $importer->template();
        $path = Spreadsheet::writeXlsx($columns, $rows, $instructions, Str::limit($importer->title(), 28, ''));

        return response()->download($path, Str::slug($importer->title()).'-import-template.xlsx', [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ])->deleteFileAfterSend();
    }

    public function preview(Request $request, string $type): JsonResponse
    {
        $importer = $this->importer($request, $type);
        $request->validate(['file' => ['required', 'file', 'max:10240', 'mimes:xlsx,csv,txt']], [
            'file.mimes' => 'Upload an Excel (.xlsx) or CSV file.',
        ]);

        $file = $request->file('file');
        $sheet = Spreadsheet::read($file->getRealPath(), $file->getClientOriginalExtension() ?: $file->extension());
        $result = $importer->preview($sheet);

        $token = Str::random(32);
        Cache::put($this->cacheKey($request, $token), ['type' => $type, 'rows' => $result['rows'], 'file' => $file->getClientOriginalName()], now()->addMinutes(30));

        $counts = ['total' => count($result['rows']), 'valid' => 0, 'invalid' => 0, 'duplicate' => 0];
        foreach ($result['rows'] as $row) {
            $counts[$row['status']]++;
        }

        return response()->json([
            'token' => $token,
            'title' => $importer->title(),
            'notes' => $importer->notes(),
            'file' => $file->getClientOriginalName(),
            'columns' => array_map(fn ($c) => ['key' => $c['key'], 'label' => $c['label'], 'required' => $c['required'] ?? false], $result['columns']),
            'rows' => array_map(fn ($r) => array_intersect_key($r, array_flip(['line', 'values', 'errors', 'duplicate', 'status'])), $result['rows']),
            'counts' => $counts,
            'unknown_headers' => $result['unknown_headers'],
            'missing_required' => $result['missing_required'],
            'can_update_duplicates' => $importer->canUpdateDuplicates(),
        ]);
    }

    public function commit(Request $request, string $type): JsonResponse
    {
        $importer = $this->importer($request, $type);
        $data = $request->validate(['token' => ['required', 'string', 'size:32'], 'include_duplicates' => ['boolean']]);

        $cached = Cache::pull($this->cacheKey($request, $data['token']));
        if (! $cached || $cached['type'] !== $type) {
            return response()->json(['message' => 'This preview has expired. Please upload the file again.'], 422);
        }

        $result = $importer->commit($cached['rows'], (bool) ($data['include_duplicates'] ?? false));

        $this->audit('imported', null, "Imported {$result['imported']} {$importer->title()} from {$cached['file']} ({$result['skipped']} skipped)", 'imports', null, [
            'type' => $type, 'file' => $cached['file'], 'imported' => $result['imported'], 'skipped' => $result['skipped'],
        ]);

        return response()->json($result + ['message' => "{$result['imported']} {$importer->title()} imported".($result['skipped'] ? ", {$result['skipped']} skipped" : '').'.']);
    }

    private function importer(Request $request, string $type): Importer
    {
        $class = self::IMPORTERS[$type] ?? null;
        abort_unless($class, 404);
        $importer = app($class);
        abort_unless($request->user()->can($importer->permission()), 403, 'You do not have permission to import '.$importer->title().'.');

        return $importer;
    }

    private function cacheKey(Request $request, string $token): string
    {
        return 'import:'.$this->tenancy()->schoolId().':'.$request->user()->id.':'.$token;
    }
}
