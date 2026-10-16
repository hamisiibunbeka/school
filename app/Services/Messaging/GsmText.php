<?php

namespace App\Services\Messaging;

/**
 * GSM 03.38 helpers for SMS: normalise text to the 7-bit GSM alphabet and count billable segments.
 * One SMS holds 160 GSM characters; longer messages are split into 153-character parts.
 * Characters from the extension table ( ^ { } \ [ ~ ] | € ) take two positions.
 */
class GsmText
{
    private const BASIC = "@£\$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

    private const EXTENSION = '^{}\\[~]|€';

    /** Typographic characters people paste from Word/WhatsApp, mapped to GSM equivalents. */
    private const REPLACE = [
        "\u{2018}" => "'", "\u{2019}" => "'", "\u{201A}" => "'", "\u{2032}" => "'",
        "\u{201C}" => '"', "\u{201D}" => '"', "\u{201E}" => '"', "\u{2033}" => '"',
        "\u{2013}" => '-', "\u{2014}" => '-', "\u{2212}" => '-', "\u{2010}" => '-', "\u{2011}" => '-',
        "\u{2026}" => '...', "\u{2022}" => '-', "\u{00B7}" => '-', "\u{00A0}" => ' ', "\u{2009}" => ' ', "\u{202F}" => ' ',
        "\u{00D7}" => 'x', "\u{2192}" => '->', "\u{00B0}" => ' deg', "\t" => ' ',
        'á' => 'a', 'â' => 'a', 'ã' => 'a', 'ê' => 'e', 'ë' => 'e', 'í' => 'i', 'î' => 'i', 'ï' => 'i',
        'ó' => 'o', 'ô' => 'o', 'õ' => 'o', 'ú' => 'u', 'û' => 'u', 'ç' => 'c', 'Á' => 'A', 'Í' => 'I', 'Ó' => 'O', 'Ú' => 'U',
    ];

    /** Convert to text Beem accepts with encoding 0. Unsupported characters (emoji etc.) are removed. */
    public static function normalize(string $text): string
    {
        $text = strtr(str_replace("\r\n", "\n", $text), self::REPLACE);
        $out = '';
        foreach (mb_str_split($text) as $char) {
            if (mb_strpos(self::BASIC, $char) !== false || mb_strpos(self::EXTENSION, $char) !== false) {
                $out .= $char;
            }
        }

        return trim(preg_replace('/ {2,}/', ' ', $out) ?? $out);
    }

    /** Length in GSM septets (extension characters count twice). */
    public static function length(string $text): int
    {
        $length = 0;
        foreach (mb_str_split($text) as $char) {
            $length += mb_strpos(self::EXTENSION, $char) !== false ? 2 : 1;
        }

        return $length;
    }

    /** Billable SMS parts for the normalised text. */
    public static function segments(string $text): int
    {
        $length = self::length(self::normalize($text));

        return $length <= 160 ? 1 : (int) ceil($length / 153);
    }
}
