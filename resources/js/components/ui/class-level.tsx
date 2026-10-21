import { Select } from '@/components/ui/form';

/** Education levels, youngest first (mirrors App\Support\EducationLevel). */
export const LEVEL_LABELS: Record<string, string> = {
    pre_primary: 'Pre-primary (Nursery)',
    primary: 'Primary',
    o_level: 'O-Level',
    a_level: 'A-Level',
};

type LevelledOption = { value: number | string; label: string; education_level?: string | null };

/** The levels present in a class list, youngest first. */
export function levelsOf(classes: LevelledOption[]): string[] {
    const present = new Set(classes.map((c) => c.education_level ?? 'o_level'));
    return Object.keys(LEVEL_LABELS).filter((l) => present.has(l));
}

/** Level of a class id; when none is chosen yet, the school's main level (the one with the most classes). */
export function levelOfClass(classes: LevelledOption[], classId: number | string | null | undefined): string {
    const found = classes.find((c) => String(c.value) === String(classId ?? ''));
    if (found) return found.education_level ?? 'o_level';
    const counts = levelsOf(classes).map((l) => [l, classesOfLevel(classes, l).length] as const);
    return counts.reduce<readonly [string, number] | null>((best, c) => (!best || c[1] > best[1] ? c : best), null)?.[0] ?? 'o_level';
}

export function classesOfLevel<T extends LevelledOption>(classes: T[], level: string): T[] {
    return classes.filter((c) => (c.education_level ?? 'o_level') === level);
}

/**
 * "Level" picker shown before a class list, so a school teaching several levels (e.g. Nursery + Primary, or
 * O-Level + A-Level) picks the level first and only sees that level's classes. Hidden for single-level schools.
 */
export function ClassLevelSelect({ classes, value, onChange, error }: { classes: LevelledOption[]; value: string; onChange: (level: string) => void; error?: string }) {
    const levels = levelsOf(classes);
    if (levels.length < 2) return null;

    return <Select label="Level" required options={levels.map((l) => ({ value: l, label: LEVEL_LABELS[l] }))} value={value} onChange={(e) => onChange(e.target.value)} error={error} />;
}
