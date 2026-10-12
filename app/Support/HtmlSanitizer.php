<?php

namespace App\Support;

use DOMDocument;
use DOMElement;
use DOMNode;

/**
 * Allow-list HTML sanitiser for CMS content shown on public websites.
 * Keeps basic formatting, headings, lists, links, images and tables;
 * strips scripts, styles, event handlers and javascript:/data: URLs.
 */
class HtmlSanitizer
{
    private const TAGS = [
        'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'a', 'img',
        'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'span', 'div', 'figure', 'figcaption',
    ];

    private const ATTRIBUTES = ['href', 'src', 'alt', 'title', 'target', 'rel', 'colspan', 'rowspan'];

    public static function clean(?string $html): ?string
    {
        if ($html === null || trim($html) === '') {
            return null;
        }

        $doc = new DOMDocument;
        libxml_use_internal_errors(true);
        $doc->loadHTML('<?xml encoding="UTF-8"><div id="__root">'.$html.'</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET);
        libxml_clear_errors();

        $root = $doc->getElementById('__root');
        if (! $root) {
            return strip_tags($html);
        }

        self::walk($root);

        $out = '';
        foreach ($root->childNodes as $child) {
            $out .= $doc->saveHTML($child);
        }

        return trim($out);
    }

    private static function walk(DOMNode $node): void
    {
        foreach (iterator_to_array($node->childNodes) as $child) {
            if ($child instanceof DOMElement) {
                $tag = strtolower($child->tagName);

                if (in_array($tag, ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'link', 'meta'], true)) {
                    $child->parentNode->removeChild($child);

                    continue;
                }

                if (! in_array($tag, self::TAGS, true)) {
                    // Unwrap unknown elements but keep their text/children.
                    self::walk($child);
                    while ($child->firstChild) {
                        $child->parentNode->insertBefore($child->firstChild, $child);
                    }
                    $child->parentNode->removeChild($child);

                    continue;
                }

                foreach (iterator_to_array($child->attributes) as $attr) {
                    $name = strtolower($attr->name);
                    $value = trim($attr->value);
                    $unsafeUrl = in_array($name, ['href', 'src'], true) && ! preg_match('#^(https?:|mailto:|tel:|/|\#)#i', $value);
                    if (! in_array($name, self::ATTRIBUTES, true) || $unsafeUrl) {
                        $child->removeAttribute($attr->name);
                    }
                }

                if ($tag === 'a' && $child->getAttribute('target') === '_blank') {
                    $child->setAttribute('rel', 'noopener noreferrer');
                }

                self::walk($child);
            }
        }
    }
}
