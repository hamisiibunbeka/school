<?php

namespace App\Imports;

use Illuminate\Validation\ValidationException;
use RuntimeException;
use SimpleXMLElement;
use ZipArchive;

/**
 * Minimal, dependency-free spreadsheet I/O for imports.
 *
 *  - read(): .xlsx (first worksheet) or .csv → list of rows (arrays of cell strings)
 *  - writeXlsx(): build a styled .xlsx (header row, widths, frozen header,
 *    drop-down validations and an Instructions sheet) for templates/error reports.
 */
class Spreadsheet
{
    public const MAX_ROWS = 5000;

    /** @return array<int, array<int, string>> */
    public static function read(string $path, string $extension): array
    {
        $extension = strtolower($extension);

        return match ($extension) {
            'xlsx' => self::readXlsx($path),
            'csv', 'txt' => self::readCsv($path),
            default => throw ValidationException::withMessages(['file' => 'Upload an Excel (.xlsx) or CSV file. Older .xls files: open in Excel and "Save As" .xlsx.']),
        };
    }

    /** @return array<int, array<int, string>> */
    private static function readCsv(string $path): array
    {
        $rows = [];
        $handle = fopen($path, 'r');
        $first = fgets($handle);
        $delimiter = substr_count((string) $first, ';') > substr_count((string) $first, ',') ? ';' : ',';
        rewind($handle);

        while (($row = fgetcsv($handle, 0, $delimiter, '"', '')) !== false) {
            if (count($rows) === 0 && isset($row[0])) {
                $row[0] = preg_replace('/^\xEF\xBB\xBF/', '', (string) $row[0]); // strip UTF-8 BOM
            }
            $rows[] = array_map(fn ($v) => trim((string) $v), $row);
            if (count($rows) > self::MAX_ROWS + 1) {
                break;
            }
        }
        fclose($handle);

        return $rows;
    }

    /** @return array<int, array<int, string>> */
    private static function readXlsx(string $path): array
    {
        $zip = new ZipArchive;
        if ($zip->open($path) !== true) {
            throw ValidationException::withMessages(['file' => 'The file could not be opened as an Excel workbook.']);
        }

        try {
            $shared = [];
            if (($xml = $zip->getFromName('xl/sharedStrings.xml')) !== false) {
                $sst = self::xml($xml);
                foreach ($sst->si as $si) {
                    $shared[] = self::text($si);
                }
            }

            $sheetPath = self::firstSheetPath($zip);
            $sheetXml = $zip->getFromName($sheetPath);
            if ($sheetXml === false) {
                throw ValidationException::withMessages(['file' => 'The workbook has no readable worksheet.']);
            }

            $rows = [];
            foreach (self::xml($sheetXml)->sheetData->row as $row) {
                $cells = [];
                foreach ($row->c as $c) {
                    $index = self::columnIndex((string) $c['r']);
                    $type = (string) $c['t'];
                    $value = match ($type) {
                        's' => $shared[(int) $c->v] ?? '',
                        'inlineStr' => self::text($c->is),
                        'b' => ((string) $c->v) === '1' ? 'TRUE' : 'FALSE',
                        default => (string) $c->v,
                    };
                    $cells[$index] = trim($value);
                }
                if ($cells) {
                    $max = max(array_keys($cells));
                    $line = array_fill(0, $max + 1, '');
                    foreach ($cells as $i => $v) {
                        $line[$i] = $v;
                    }
                    $rowNumber = (int) $row['r'] ?: count($rows) + 1;
                    // Keep row positions so error messages can point at the real Excel row.
                    while (count($rows) < $rowNumber - 1) {
                        $rows[] = [];
                    }
                    $rows[] = $line;
                }
                if (count($rows) > self::MAX_ROWS + 1) {
                    break;
                }
            }

            return $rows;
        } finally {
            $zip->close();
        }
    }

    private static function firstSheetPath(ZipArchive $zip): string
    {
        $workbook = $zip->getFromName('xl/workbook.xml');
        $rels = $zip->getFromName('xl/_rels/workbook.xml.rels');
        if ($workbook === false || $rels === false) {
            return 'xl/worksheets/sheet1.xml';
        }

        $wb = self::xml($workbook);
        $first = $wb->sheets->sheet[0] ?? null;
        $rid = $first ? (string) $first->attributes('http://schemas.openxmlformats.org/officeDocument/2006/relationships')['id'] : '';

        foreach (self::xml($rels)->Relationship as $rel) {
            if ((string) $rel['Id'] === $rid) {
                $target = ltrim((string) $rel['Target'], '/');

                return str_starts_with($target, 'xl/') ? $target : 'xl/'.$target;
            }
        }

        return 'xl/worksheets/sheet1.xml';
    }

    private static function xml(string $content): SimpleXMLElement
    {
        $xml = simplexml_load_string($content, SimpleXMLElement::class, LIBXML_NONET | LIBXML_NOCDATA);
        if ($xml === false) {
            throw new RuntimeException('Invalid spreadsheet XML.');
        }

        return $xml;
    }

    private static function text(?SimpleXMLElement $node): string
    {
        if (! $node) {
            return '';
        }
        if (isset($node->t)) {
            return (string) $node->t;
        }
        $text = '';
        foreach ($node->r as $run) {
            $text .= (string) $run->t;
        }

        return $text;
    }

    private static function columnIndex(string $ref): int
    {
        $letters = preg_replace('/\d+/', '', $ref);
        $index = 0;
        foreach (str_split($letters) as $ch) {
            $index = $index * 26 + (ord($ch) - 64);
        }

        return max(0, $index - 1);
    }

    private static function columnLetter(int $index): string
    {
        $letters = '';
        $n = $index + 1;
        while ($n > 0) {
            $m = ($n - 1) % 26;
            $letters = chr(65 + $m).$letters;
            $n = intdiv($n - 1, 26);
        }

        return $letters;
    }

    /**
     * Build an .xlsx file and return its path.
     *
     * @param  array<int, array{label: string, width?: int, required?: bool, options?: array<int,string>}>  $columns
     * @param  array<int, array<int, string|int|float|null>>  $rows
     * @param  array<int, array<int, string>>  $instructions  rows for a second "Instructions" sheet
     */
    public static function writeXlsx(array $columns, array $rows, array $instructions = [], string $sheetName = 'Data'): string
    {
        $esc = fn ($v) => htmlspecialchars((string) $v, ENT_XML1 | ENT_QUOTES, 'UTF-8');

        $sheet = function (array $header, array $data, array $widths, array $validations, bool $freeze) use ($esc) {
            $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                .'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
            if ($freeze) {
                $xml .= '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
            }
            $xml .= '<cols>';
            foreach ($widths as $i => $w) {
                $xml .= '<col min="'.($i + 1).'" max="'.($i + 1).'" width="'.$w.'" customWidth="1"/>';
            }
            $xml .= '</cols><sheetData>';

            $all = array_merge([$header], $data);
            foreach ($all as $r => $cells) {
                $xml .= '<row r="'.($r + 1).'">';
                foreach (array_values($cells) as $c => $value) {
                    if ($value === null || $value === '') {
                        continue;
                    }
                    $ref = self::columnLetter($c).($r + 1);
                    $style = $r === 0 ? (is_array($value) ? $value['style'] : 1) : 0;
                    $text = is_array($value) ? $value['text'] : $value;
                    if ($r > 0 && is_int($text) || ($r > 0 && is_float($text))) {
                        $xml .= '<c r="'.$ref.'"><v>'.$text.'</v></c>';
                    } else {
                        $xml .= '<c r="'.$ref.'" t="inlineStr" s="'.$style.'"><is><t xml:space="preserve">'.$esc($text).'</t></is></c>';
                    }
                }
                $xml .= '</row>';
            }
            $xml .= '</sheetData>';

            if ($validations) {
                $xml .= '<dataValidations count="'.count($validations).'">';
                foreach ($validations as $col => $options) {
                    $letter = self::columnLetter($col);
                    $xml .= '<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="'.$letter.'2:'.$letter.(self::MAX_ROWS + 1).'">'
                        .'<formula1>"'.$esc(implode(',', $options)).'"</formula1></dataValidation>';
                }
                $xml .= '</dataValidations>';
            }

            return $xml.'</worksheet>';
        };

        $header = array_map(fn ($c) => ['text' => $c['label'].(! empty($c['required']) ? ' *' : ''), 'style' => ! empty($c['required']) ? 2 : 1], $columns);
        $widths = array_map(fn ($c) => $c['width'] ?? max(14, min(40, mb_strlen($c['label']) + 6)), $columns);
        $validations = [];
        foreach ($columns as $i => $c) {
            if (! empty($c['options']) && mb_strlen(implode(',', $c['options'])) < 250) {
                $validations[$i] = $c['options'];
            }
        }

        $sheets = [[$sheetName, $sheet($header, $rows, $widths, $validations, true)]];
        if ($instructions) {
            $sheets[] = ['Instructions', $sheet(array_shift($instructions), $instructions, [28, 12, 60, 30], [], true)];
        }

        $styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            .'<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>'
            .'<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
            .'<fill><patternFill patternType="solid"><fgColor rgb="FF4361EE"/><bgColor indexed="64"/></patternFill></fill>'
            .'<fill><patternFill patternType="solid"><fgColor rgb="FFE7515A"/><bgColor indexed="64"/></patternFill></fill></fills>'
            .'<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
            .'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            .'<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
            .'<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
            .'<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>'
            .'</styleSheet>';

        $sheetEntries = '';
        $relEntries = '';
        $overrides = '';
        foreach ($sheets as $i => [$name]) {
            $n = $i + 1;
            $sheetEntries .= '<sheet name="'.$esc($name).'" sheetId="'.$n.'" r:id="rId'.$n.'"/>';
            $relEntries .= '<Relationship Id="rId'.$n.'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'.$n.'.xml"/>';
            $overrides .= '<Override PartName="/xl/worksheets/sheet'.$n.'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        }
        $styleRel = count($sheets) + 1;

        $path = tempnam(sys_get_temp_dir(), 'xlsx');
        $zip = new ZipArchive;
        $zip->open($path, ZipArchive::OVERWRITE);
        $zip->addFromString('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            .'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
            .'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            .'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            .$overrides.'</Types>');
        $zip->addFromString('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
        $zip->addFromString('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'.$sheetEntries.'</sheets></workbook>');
        $zip->addFromString('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'.$relEntries
            .'<Relationship Id="rId'.$styleRel.'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
        $zip->addFromString('xl/styles.xml', $styles);
        foreach ($sheets as $i => [, $xml]) {
            $zip->addFromString('xl/worksheets/sheet'.($i + 1).'.xml', $xml);
        }
        $zip->close();

        return $path;
    }
}
