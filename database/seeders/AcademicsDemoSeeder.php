<?php

namespace Database\Seeders;

use App\Models\ClassSubject;
use App\Models\SchoolClass;
use App\Models\Term;
use App\Models\User;
use App\Support\Tenancy;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Demo academics data for the demo school: a clash-free weekly timetable for
 * every class/stream, lesson plans for the current term, homework and a
 * school calendar of Tanzanian public holidays, exams and activities.
 *
 * Runs inside the demo school's tenancy context (see DatabaseSeeder).
 */
class AcademicsDemoSeeder extends Seeder
{
    /** 8 x 40-minute periods from 07:30 with a short break and lunch. */
    private const PERIODS = [
        ['07:30', '08:10'], ['08:10', '08:50'], ['08:50', '09:30'], ['09:30', '10:10'],
        // 10:10 – 10:40 break
        ['10:40', '11:20'], ['11:20', '12:00'], ['12:00', '12:40'],
        // 12:40 – 13:40 lunch
        ['13:40', '14:20'],
    ];

    private const TOPICS = [
        'MATH' => ['Numbers', 'Fractions', 'Decimals and Percentages', 'Units', 'Approximations', 'Geometry', 'Algebra', 'Quadratic Equations', 'Logarithms', 'Coordinate Geometry', 'Ratio, Profit and Loss', 'Statistics'],
        'ENG' => ['Listening for Information', 'Grammar: Tenses', 'Reading Comprehension', 'Composition Writing', 'Letter Writing', 'Literature: Poetry', 'Literature: Novels', 'Public Speaking', 'Summary Writing', 'Vocabulary in Context'],
        'KISW' => ['Aina za Maneno', 'Ufahamu', 'Insha', 'Fasihi Simulizi', 'Uandishi wa Barua', 'Ushairi', 'Riwaya', 'Sarufi: Ngeli za Nomino', 'Mjengo wa Tungo', 'Methali na Nahau'],
        'BIO' => ['Introduction to Biology', 'Safety in the Laboratory', 'Cell Structure', 'Classification of Living Things', 'Nutrition', 'Balance of Nature', 'Gaseous Exchange', 'Transport in Living Things', 'Reproduction', 'Genetics'],
        'CHEM' => ['Introduction to Chemistry', 'Laboratory Techniques', 'Heat Sources and Flames', 'Matter', 'Air, Combustion and Rusting', 'Water', 'Atomic Structure', 'Periodic Classification', 'Chemical Formulae and Equations', 'Acids, Bases and Salts'],
        'PHY' => ['Introduction to Physics', 'Measurement', 'Force', 'Archimedes Principle', 'Structure and Properties of Matter', 'Pressure', 'Work, Energy and Power', 'Light', 'Optical Instruments', 'Current Electricity'],
        'GEO' => ['The Solar System', 'Map Work', 'Weather and Climate', 'Major Features of the Earth', 'Photograph Interpretation', 'Population', 'Agriculture in Tanzania', 'Water Management', 'Mining', 'Tourism'],
        'HIST' => ['Sources of History', 'Evolution of Man', 'Development of Economic Activities', 'Social and Political Organisation', 'African Interactions', 'Colonial Conquest', 'Colonial Economy', 'Nationalism and Decolonisation', 'Tanganyika Independence', 'The Union of Tanganyika and Zanzibar'],
        'CIV' => ['Our Nation', 'Promotion of Life Skills', 'Human Rights', 'Democracy', 'Gender', 'Responsible Citizenship', 'Work', 'Family Life', 'Road Safety Education', 'Government of the United Republic'],
        'COMM' => ['Introduction to Commerce', 'Production', 'Trade', 'Warehousing', 'Transportation', 'Communication', 'Insurance', 'Banking', 'Business Units', 'Marketing'],
        'ICT' => ['Introduction to Computers', 'Computer Hardware', 'Operating Systems', 'Word Processing', 'Spreadsheets', 'Databases', 'Internet and Email', 'Programming Concepts', 'Computer Networks', 'Computer Ethics'],
    ];

    private const ACTIVITIES = [
        'Guided discussion, worked examples on the board and group exercises.',
        'Learners work in pairs on textbook exercises; teacher checks and gives feedback.',
        'Practical demonstration followed by individual written exercise.',
        'Question-and-answer session, note taking and short class quiz.',
        'Group presentations and peer review.',
    ];

    public function run(): void
    {
        mt_srand(4620);

        $tenancy = app(Tenancy::class);
        $stamp = ['tenant_id' => $tenancy->tenantId(), 'school_id' => $tenancy->schoolId()];
        $now = now();

        $classes = SchoolClass::with('streams')->orderBy('level')->get();
        $allocations = ClassSubject::with('subject')->get()->groupBy('school_class_id');

        $this->seedTimetable($classes, $allocations, $stamp, $now);
        $this->seedLessonPlans($classes, $allocations, $stamp, $now);
        $this->seedHomework($classes, $allocations, $stamp);
        $this->seedEvents($stamp);
    }

    /** Greedy, clash-free timetable: no teacher teaches two lessons at the same time. */
    private function seedTimetable($classes, $allocations, array $stamp, $now): void
    {
        $slotsPerWeek = 5 * count(self::PERIODS);
        $streams = [];
        foreach ($classes as $class) {
            $list = $allocations[$class->id] ?? collect();
            $total = max(1, $list->sum(fn ($a) => (int) ($a->periods_per_week ?: 4)));

            // Scale each subject's periods to fill the 40-slot week.
            $quota = [];
            $fractions = [];
            foreach ($list as $a) {
                $exact = (int) ($a->periods_per_week ?: 4) * $slotsPerWeek / $total;
                $quota[$a->id] = (int) floor($exact);
                $fractions[$a->id] = $exact - floor($exact);
            }
            arsort($fractions);
            $remaining = $slotsPerWeek - array_sum($quota);
            foreach (array_keys($fractions) as $id) {
                if ($remaining-- <= 0) {
                    break;
                }
                $quota[$id]++;
            }

            foreach ($class->streams as $stream) {
                $streams[] = ['class' => $class, 'stream' => $stream, 'allocs' => $list->keyBy('id'), 'quota' => $quota];
            }
        }

        $rows = [];
        $teacherBusy = [];
        for ($day = 1; $day <= 5; $day++) {
            $dailyCount = [];
            foreach (self::PERIODS as $p => [$start, $end]) {
                // Rotate stream order so no stream always gets first pick.
                $order = array_keys($streams);
                $offset = ($day * 3 + $p) % max(1, count($order));
                $order = array_merge(array_slice($order, $offset), array_slice($order, 0, $offset));

                foreach ($order as $si) {
                    $s = &$streams[$si];
                    $free = fn ($a) => ! $a->employee_id || empty($teacherBusy[$day][$p][$a->employee_id]);
                    $underDailyCap = fn ($a) => ($dailyCount[$si][$a->id] ?? 0) < 2;

                    $candidates = $s['allocs']->filter(fn ($a) => $s['quota'][$a->id] > 0 && $free($a) && $underDailyCap($a))
                        ->sortByDesc(fn ($a) => $s['quota'][$a->id] * 10 + mt_rand(0, 9) - ($dailyCount[$si][$a->id] ?? 0) * 25);
                    $pick = $candidates->first();

                    if (! $pick) {
                        unset($s);

                        continue; // free / private study period
                    }

                    $s['quota'][$pick->id]--;
                    $dailyCount[$si][$pick->id] = ($dailyCount[$si][$pick->id] ?? 0) + 1;
                    if ($pick->employee_id) {
                        $teacherBusy[$day][$p][$pick->employee_id] = true;
                    }

                    $rows[] = $stamp + [
                        'school_class_id' => $s['class']->id,
                        'stream_id' => $s['stream']->id,
                        'subject_id' => $pick->subject_id,
                        'employee_id' => $pick->employee_id,
                        'day_of_week' => $day,
                        'start_time' => $start.':00',
                        'end_time' => $end.':00',
                        'room' => $pick->subject?->code === 'ICT' ? 'Computer Lab '.$s['class']->level : 'Room '.($s['class']->code ?? $s['class']->level).$s['stream']->name,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ];
                    unset($s);
                }
            }
        }

        foreach (array_chunk($rows, 200) as $chunk) {
            DB::table('timetable_slots')->insert($chunk);
        }
    }

    private function seedLessonPlans($classes, $allocations, array $stamp, $now): void
    {
        $term = Term::current();
        if (! $term) {
            return;
        }

        $termStart = CarbonImmutable::parse($term->start_date->toDateString());
        $currentWeek = max(1, (int) floor($termStart->diffInDays(CarbonImmutable::now(), false) / 7) + 1);
        $lastWeek = min(20, $currentWeek + 4);

        $rows = [];
        foreach ($classes as $class) {
            foreach ($allocations[$class->id] ?? [] as $a) {
                $topics = self::TOPICS[$a->subject?->code] ?? ['General Topic'];
                // Higher classes are further along the syllabus.
                $base = ($class->level - 1) * 2;
                for ($week = 1; $week <= $lastWeek; $week++) {
                    $topic = $topics[($base + intdiv($week - 1, 2)) % count($topics)];
                    $part = ($week - 1) % 2 + 1;

                    if ($week < $currentWeek) {
                        $status = mt_rand(1, 100) <= 88 ? 'taught' : 'skipped';
                    } elseif ($week === $currentWeek) {
                        $status = mt_rand(0, 1) ? 'taught' : 'planned';
                    } else {
                        $status = 'planned';
                    }

                    $rows[] = $stamp + [
                        'school_class_id' => $class->id,
                        'subject_id' => $a->subject_id,
                        'employee_id' => $a->employee_id,
                        'term_id' => $term->id,
                        'week' => $week,
                        'topic' => $topic,
                        'sub_topic' => $part === 1 ? "Introduction to {$topic}" : "{$topic}: application and exercises",
                        'objectives' => "By the end of the lesson learners should be able to explain the key ideas of ".strtolower($topic).' and solve related problems.',
                        'activities' => self::ACTIVITIES[mt_rand(0, count(self::ACTIVITIES) - 1)],
                        'status' => $status,
                        'created_at' => $termStart->addWeeks($week - 1)->subDays(3),
                        'updated_at' => $now,
                    ];
                }
            }
        }

        foreach (array_chunk($rows, 300) as $chunk) {
            DB::table('lesson_plans')->insert($chunk);
        }
    }

    private function seedHomework($classes, $allocations, array $stamp): void
    {
        $items = [
            ['MATH', 'Quadratic equations exercise 4.3', 'Solve questions 1–20 using factorisation and the quadratic formula. Show all working.', 3, 20, 'published'],
            ['ENG', 'Composition: My Best Holiday', 'Write a composition of 350–400 words. Pay attention to paragraphing and punctuation.', 5, 20, 'published'],
            ['KISW', 'Insha: Umuhimu wa Elimu', 'Andika insha ya maneno 300 kuhusu umuhimu wa elimu kwa jamii.', 6, 20, 'published'],
            ['BIO', 'Label the plant cell', 'Draw and label a plant cell. State the function of each organelle.', 2, 10, 'published'],
            ['CHEM', 'Lab report: Rusting of iron', 'Write a full report of the rusting experiment: aim, apparatus, procedure, observations and conclusion.', -2, 25, 'published'],
            ['PHY', 'Pressure in liquids worksheet', 'Complete the worksheet on pressure in liquids. Use g = 10 N/kg.', 1, 15, 'published'],
            ['GEO', 'Map reading: Moshi 1:50,000', 'Using the Moshi topographical map extract, answer questions (a) to (f) on page 42.', 8, 30, 'published'],
            ['HIST', 'Maji Maji War essay', 'Discuss six causes of the Maji Maji war (1905–1907). Not more than two pages.', 10, 25, 'draft'],
            ['CIV', 'Road safety poster', 'In groups of four, design a poster promoting road safety around the school.', -6, 20, 'closed'],
            ['MATH', 'Statistics: mean, median and mode', 'Exercise 7.1, numbers 1–15. Present frequency tables neatly.', -9, 15, 'closed'],
            ['COMM', 'Types of business units', 'Compare sole proprietorship and partnership using a table (8 points).', 4, 16, 'published'],
            ['ICT', 'Spreadsheet: class marks', 'Create a spreadsheet of 10 learners with marks in 5 subjects and compute totals and averages using formulas.', 7, 20, 'published'],
            ['ENG', 'Reading: "Things Fall Apart" chapters 1–5', 'Read chapters 1–5 and summarise the character of Okonkwo in one page.', -1, null, 'published'],
        ];

        $now = CarbonImmutable::now();
        $rows = [];
        foreach ($items as $i => [$code, $title, $instructions, $dueIn, $max, $status]) {
            // Find a class that offers the subject, rotating through classes.
            $candidates = $classes->filter(fn ($c) => ($allocations[$c->id] ?? collect())->contains(fn ($a) => $a->subject?->code === $code))->values();
            if ($candidates->isEmpty()) {
                continue;
            }
            $class = $candidates[$i % $candidates->count()];
            $alloc = $allocations[$class->id]->first(fn ($a) => $a->subject?->code === $code);
            $stream = $class->streams->count() && $i % 3 === 0 ? $class->streams[$i % $class->streams->count()] : null;

            $rows[] = $stamp + [
                'school_class_id' => $class->id,
                'stream_id' => $stream?->id,
                'subject_id' => $alloc->subject_id,
                'employee_id' => $alloc->employee_id,
                'title' => $title,
                'instructions' => $instructions,
                'due_date' => $now->addDays($dueIn)->toDateString(),
                'max_score' => $max,
                'attachment_path' => null,
                'status' => $status,
                'created_at' => $now->addDays($dueIn - 7),
                'updated_at' => $now,
            ];
        }

        DB::table('assignments')->insert($rows);
    }

    private function seedEvents(array $stamp): void
    {
        $y = (int) now()->format('Y');
        $createdBy = User::where('email', 'admin@mzenzi.test')->value('id');
        $now = now();

        // [title, type, start, end|null, all_day, start time, end time, audience, location, description]
        $events = [
            ['Term I opens', 'event', "$y-01-08", null, true, null, null, 'all', 'School compound', 'All students report by 14:00.'],
            ['Zanzibar Revolution Day', 'holiday', "$y-01-12", null, true, null, null, 'all', null, 'Public holiday — no classes.'],
            ['Term I mid-term break', 'holiday', "$y-03-27", "$y-04-05", true, null, null, 'all', null, 'Boarders go home; classes resume on Monday.'],
            ['Karume Day', 'holiday', "$y-04-07", null, true, null, null, 'all', null, 'Public holiday.'],
            ['Union Day', 'holiday', "$y-04-26", null, true, null, null, 'all', null, 'Celebrating the Union of Tanganyika and Zanzibar.'],
            ['Term I terminal examinations', 'exam', "$y-05-25", "$y-06-05", true, null, null, 'students', 'Examination halls', 'Forms One to Four.'],
            ['Saba Saba', 'holiday', "$y-07-07", null, true, null, null, 'all', null, 'Public holiday.'],
            ['Nane Nane (Farmers\' Day)', 'holiday', "$y-08-08", null, true, null, null, 'all', null, 'Public holiday.'],
            ['Term II mid-term break', 'holiday', "$y-08-28", "$y-09-06", true, null, null, 'all', null, 'Mid-term break for all classes.'],
            ['Form Four graduation', 'event', "$y-09-26", null, false, '09:00', '15:00', 'all', 'School hall', 'Parents of Form Four candidates are invited.'],
            ['Nyerere Day', 'holiday', "$y-10-14", null, true, null, null, 'all', null, 'Mwalimu Julius K. Nyerere Day — public holiday.'],
            ['Parents\' meeting (Term II)', 'meeting', "$y-10-17", null, false, '09:00', '13:00', 'parents', 'School hall', 'Academic progress review and fees update. All parents/guardians are requested to attend.'],
            ['Inter-house sports day', 'sports', "$y-10-24", null, false, '08:00', '16:00', 'all', 'School playground', 'Athletics, football, netball and volleyball finals.'],
            ['Term II fees deadline', 'deadline', "$y-10-31", null, true, null, null, 'parents', null, 'Last day for payment of Term II fee balances.'],
            ['Form Three geography field trip', 'trip', "$y-10-30", null, false, '06:00', '19:00', 'students', 'Mikumi National Park', 'Field study on physical features and tourism.'],
            ['Form Four National Examinations (CSEE)', 'exam', "$y-11-02", "$y-11-20", true, null, null, 'students', 'Examination halls', 'NECTA Certificate of Secondary Education Examination.'],
            ['Annual examinations (Forms One–Three)', 'exam', "$y-11-23", "$y-12-04", true, null, null, 'students', 'Examination halls', 'End-of-year examinations.'],
            ['Closing day & prize giving', 'event', "$y-12-05", null, false, '09:00', '13:00', 'all', 'School hall', 'Report cards issued; school closes for the year.'],
            ['Independence Day', 'holiday', "$y-12-09", null, true, null, null, 'all', null, 'Uhuru Day — public holiday.'],
            ['Christmas Day', 'holiday', "$y-12-25", null, true, null, null, 'all', null, 'Public holiday.'],
            ['Boxing Day', 'holiday', "$y-12-26", null, true, null, null, 'all', null, 'Public holiday.'],
        ];

        $rows = [];
        foreach ($events as [$title, $type, $start, $end, $allDay, $from, $to, $audience, $location, $description]) {
            $rows[] = $stamp + [
                'title' => $title,
                'description' => $description,
                'type' => $type,
                'starts_at' => $start.' '.($allDay ? '00:00:00' : $from.':00'),
                'ends_at' => ($end ?? $start).' '.($allDay ? '23:59:00' : $to.':00'),
                'all_day' => $allDay,
                'audience' => $audience,
                'location' => $location,
                'created_by' => $createdBy,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        DB::table('events')->insert($rows);
    }
}
