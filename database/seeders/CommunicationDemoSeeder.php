<?php

namespace Database\Seeders;

use App\Models\Announcement;
use App\Models\MessageTemplate;
use App\Models\Plan;
use App\Models\SchoolClass;
use App\Models\SupportTicket;
use App\Models\Tenant;
use App\Models\User;
use App\Notifications\SchoolNotification;
use App\Services\Messaging\MessageService;
use App\Services\SchoolProvisioner;
use App\Support\Tenancy;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Communication + platform demo data: announcements, templates, SMS/email
 * delivery history, support tickets, two extra tenants and notifications.
 *
 * Runs inside the Mzenzi Secondary School tenancy context.
 */
class CommunicationDemoSeeder extends Seeder
{
    public function run(): void
    {
        mt_srand(4242);

        $tenancy = app(Tenancy::class);
        $school = $tenancy->school();
        $tenantId = $tenancy->tenantId();
        $schoolId = $tenancy->schoolId();
        $admin = User::where('email', 'admin@mzenzi.test')->first();
        $principal = User::where('email', 'principal@mzenzi.test')->first() ?? $admin;
        $bursar = User::where('email', 'bursar@mzenzi.test')->first() ?? $admin;

        $this->seedSettings();
        $this->seedTemplates();
        $this->seedAnnouncements($admin, $principal);
        $this->seedMessageLogs($tenantId, $schoolId, $school?->name ?? 'Mzenzi Secondary School', [$admin?->id, $bursar?->id, $principal?->id]);
        $this->seedTickets($tenantId, $admin);
        $this->seedOtherTenants();
        $this->seedNotifications();
    }

    /** Payment instructions shown on invoices and the parent portal. */
    private function seedSettings(): void
    {
        $school = app(Tenancy::class)->school();
        if (! $school) {
            return;
        }

        $school->settings = array_merge([
            'pass_mark' => 30,
            'attendance_alert_threshold' => 80,
            'fee_reminder_days' => 7,
            'late_after' => '07:45',
            'sms_sender_id' => 'MZENZI-SS',
            'bank_name' => 'NMB Bank PLC - Kinondoni Branch',
            'bank_account_name' => 'Mzenzi Secondary School',
            'bank_account_no' => '20110045678',
            'mobile_money_provider' => 'M-Pesa (Vodacom)',
            'mobile_money_paybill' => '555123',
            'mobile_money_account' => 'Student admission number',
            'payment_instructions' => "Pay school fees (TZS) using any of the following:\n• NMB Bank, A/C name: Mzenzi Secondary School, A/C no: 20110045678\n• M-Pesa Lipa namba 555123, account: student admission number\nAlways quote the admission number as the reference and keep your bank slip / SMS confirmation. Cash is not accepted at the school gate.",
        ], $school->settings ?? []);
        $school->save();
    }

    private function seedTemplates(): void
    {
        $templates = [
            ['Fee reminder', 'sms', null, 'Ndugu {guardian_name}, salio la ada kwa {student_name} ({class}) ni {balance}. Tafadhali lipa kupitia NMB 20110045678 au M-Pesa 555123. {school_name}.'],
            ['Absence alert', 'sms', null, 'Dear {guardian_name}, {student_name} ({class}) was marked absent today. Please contact the class teacher if this is unexpected. {school_name}'],
            ['Results published', 'sms', null, 'Dear {guardian_name}, Term II mid-term results for {student_name} are now available on the parent portal. {school_name}'],
            ['General notice', 'email', 'Notice from {school_name}', "Dear {guardian_name},\n\nPlease note the following important information from the school administration.\n\nKind regards,\n{school_name}"],
            ['Meeting invitation', 'sms', null, 'Dear {guardian_name}, you are invited to the parents meeting on Saturday at 9:00am in the school hall to discuss {student_name}\'s progress. {school_name}'],
            ['Payment receipt', 'sms', null, 'Asante {guardian_name}. Payment for {student_name} has been received. Outstanding balance: {balance}. {school_name}'],
        ];

        foreach ($templates as [$name, $channel, $subject, $body]) {
            MessageTemplate::updateOrCreate(['name' => $name], ['channel' => $channel, 'subject' => $subject, 'body' => $body]);
        }
    }

    private function seedAnnouncements(?User $admin, ?User $principal): void
    {
        if (Announcement::exists()) {
            return;
        }

        $form4 = SchoolClass::orderByDesc('level')->first();
        $now = now();

        $items = [
            ['Term II opening date', "Term II begins on Monday 1st July. All students must report by 4:00pm on Sunday 30th June (boarders) or 7:30am on Monday (day scholars) in full school uniform.\n\nKaribuni sana!", 'all', null, 'important', $now->subMonths(3)->startOfMonth()->addDays(20), $now->subMonths(3)->addDays(15)],
            ['Fee payment reminder — Term II', "Parents and guardians are reminded that Term II fees were due on 15th July. Please clear outstanding balances via NMB or M-Pesa (Lipa namba 555123) using the student's admission number.", 'parents', null, 'urgent', $now->subDays(20), $now->addDays(25)],
            ['Inter-house sports day', 'Our annual inter-house sports day will be held on Friday 25th October from 8:00am. Parents are welcome to attend and cheer the houses. Students should come in house T-shirts.', 'all', null, 'normal', $now->subDays(6), $now->addDays(16)],
            ['Parents meeting — Saturday 19th October', 'All parents and guardians are invited to the termly general meeting in the school hall at 9:00am. Agenda: academic performance, school development fund and boarding welfare.', 'parents', null, 'important', $now->subDays(3), $now->addDays(9)],
            ['Form Four NECTA examination timetable', 'The CSEE timetable has been released. Candidates must collect their personal copies from the academic office. Mock revision timetable runs until the start of the national examinations.', 'class', $form4?->id, 'urgent', $now->subDays(10), $now->addDays(30)],
            ['Staff meeting — Monday', 'There will be a full staff meeting on Monday at 2:30pm in the staff room to review mid-term results and plan for the end of year examinations.', 'staff', null, 'normal', $now->subDays(2), $now->addDays(3)],
            ['Library week', 'The library will host a reading competition next week. Students may borrow up to three books. Overdue books must be returned by Friday.', 'students', null, 'normal', $now->subDays(8), $now->addDays(6)],
            ['Mid-term results published', 'Mid-term examination results are now available on the parent and student portal. Class teachers are available for consultation on Thursday afternoons.', 'all', null, 'normal', $now->subDays(14), $now->addDays(20)],
            ['Water supply interruption', 'DAWASA has informed us of planned water supply interruption on Wednesday. Boarders are asked to store water on Tuesday evening.', 'all', null, 'important', $now->subDays(40), $now->subDays(30)],
            ['End of year examinations', 'End of year examinations for Forms One to Three will begin on Monday 11th November. Detailed timetables will be shared by class teachers.', 'all', null, 'important', $now->addDays(5), $now->addDays(45)],
            ['Health check-up for boarders', 'The school nurse will conduct routine health check-ups for all boarders on Thursday. Students with chronic conditions should bring their medication cards.', 'students', null, 'normal', $now->subDays(1), $now->addDays(4)],
        ];

        foreach ($items as $i => [$title, $body, $audience, $classId, $priority, $publish, $expires]) {
            $a = new Announcement([
                'title' => $title,
                'body' => $body,
                'audience' => $audience,
                'school_class_id' => $classId,
                'priority' => $priority,
                'publish_at' => $publish,
                'expires_at' => $expires,
            ]);
            $a->created_by = ($i % 3 === 0 ? $principal : $admin)?->id;
            $a->notified_at = $publish->isPast() ? $publish : null;
            $a->created_at = $publish->isPast() ? $publish->subHour() : $now->subDay();
            $a->save();
        }
    }

    /** ~150 SMS/email logs spread over the last six months. */
    private function seedMessageLogs(int $tenantId, int $schoolId, string $schoolName, array $senders): void
    {
        if (DB::table('message_logs')->where('school_id', $schoolId)->exists()) {
            return;
        }

        $guardians = DB::table('guardian_student')
            ->join('guardians', 'guardians.id', '=', 'guardian_student.guardian_id')
            ->join('students', 'students.id', '=', 'guardian_student.student_id')
            ->leftJoin('school_classes', 'school_classes.id', '=', 'students.school_class_id')
            ->where('students.school_id', $schoolId)
            ->limit(120)
            ->get(['guardians.first_name as gf', 'guardians.last_name as gl', 'guardians.phone', 'guardians.email', 'students.first_name as sf', 'students.last_name as sl', 'school_classes.name as class']);

        if ($guardians->isEmpty()) {
            return;
        }

        $bodies = [
            ['sms', null, 'Ndugu {g}, salio la ada kwa {s} ({c}) ni TZS {b}. Tafadhali lipa kupitia NMB 20110045678 au M-Pesa 555123. '.$schoolName.'.'],
            ['sms', null, 'Dear {g}, {s} ({c}) was marked absent today. Please contact the class teacher if this is unexpected. '.$schoolName],
            ['sms', null, 'Dear {g}, mid-term results for {s} are now available on the parent portal. '.$schoolName],
            ['sms', null, 'Asante {g}. Payment for {s} has been received. Outstanding balance: TZS {b}. '.$schoolName],
            ['sms', null, 'Dear {g}, you are invited to the parents meeting on Saturday at 9:00am in the school hall to discuss {s}\'s progress and the school development fund contribution. '.$schoolName],
            ['email', 'Term II fee statement', "Dear {g},\n\nPlease find the Term II fee position for {s} ({c}). Outstanding balance: TZS {b}.\n\nKind regards,\n{$schoolName}"],
        ];

        $rows = [];
        for ($i = 0; $i < 150; $i++) {
            $g = $guardians[mt_rand(0, $guardians->count() - 1)];
            [$channel, $subject, $tpl] = $bodies[mt_rand(0, count($bodies) - 1)];
            if ($channel === 'email' && ! $g->email) {
                $channel = 'sms';
                [, $subject, $tpl] = $bodies[0];
            }

            $text = strtr($tpl, [
                '{g}' => trim("{$g->gf} {$g->gl}"),
                '{s}' => trim("{$g->sf} {$g->sl}"),
                '{c}' => (string) $g->class,
                '{b}' => number_format(mt_rand(5, 90) * 10000),
            ]);

            $roll = mt_rand(1, 100);
            $status = $roll <= 6 ? 'failed' : ($roll <= 70 ? 'delivered' : 'sent');
            // Spread over the last ~6 months, weighted towards recent weeks.
            $daysAgo = (int) floor(pow(mt_rand(0, 1000) / 1000, 1.6) * 175);
            $at = now()->subDays($daysAgo)->setTime(mt_rand(7, 18), mt_rand(0, 59));

            $rows[] = [
                'tenant_id' => $tenantId,
                'school_id' => $schoolId,
                'channel' => $channel,
                'recipient' => $channel === 'email' ? $g->email : (MessageService::normalizePhone($g->phone) ?? $g->phone),
                'recipient_name' => trim("{$g->gf} {$g->gl}"),
                'subject' => $subject,
                'message' => $text,
                'status' => $status,
                'provider_reference' => $status === 'failed' ? null : 'LOG-'.strtoupper(Str::random(12)),
                'error' => $status === 'failed' ? ['Invalid destination number', 'Network timeout from provider', 'Subscriber absent'][mt_rand(0, 2)] : null,
                'credits' => $channel === 'sms' ? MessageService::credits($text) : 0,
                'sent_by' => $senders[mt_rand(0, count($senders) - 1)],
                'created_at' => $at,
                'updated_at' => $at,
            ];
        }

        foreach (array_chunk($rows, 50) as $chunk) {
            DB::table('message_logs')->insert($chunk);
        }
    }

    private function seedTickets(int $tenantId, ?User $admin): void
    {
        if (SupportTicket::where('tenant_id', $tenantId)->exists()) {
            return;
        }

        $tickets = [
            ['Bulk SMS sender ID registration', 'We would like our SMS to show "MZENZI-SS" instead of the default sender. Please advise on TCRA registration requirements.', 'normal', 'in_progress', null, 12],
            ['Report card template — add head teacher signature', 'Can the report card show a scanned signature of the head teacher and the school stamp?', 'low', 'resolved', 'Signature and stamp upload added under report card settings. Upload a transparent PNG.', 35],
            ['Unable to post payroll for September', 'Payroll approval fails with "period closed" error for September salaries.', 'high', 'resolved', 'The fiscal period had been closed early by mistake. Period re-opened after authorisation; payroll posted successfully.', 20],
            ['Request: training session for new bursar', 'Our new bursar starts next week and needs a walkthrough of fees, receipts and bank reconciliation.', 'normal', 'open', null, 2],
        ];

        foreach ($tickets as [$subject, $description, $priority, $status, $resolution, $daysAgo]) {
            $t = new SupportTicket([
                'tenant_id' => $tenantId,
                'created_by' => $admin?->id,
                'subject' => $subject,
                'description' => $description,
                'priority' => $priority,
                'status' => $status,
                'resolution' => $resolution,
            ]);
            $t->created_at = now()->subDays($daysAgo);
            $t->updated_at = now()->subDays(max(0, $daysAgo - 3));
            $t->save();
        }

        // Earlier paid year for the demo tenant (renewal history).
        $tenant = Tenant::find($tenantId);
        if ($tenant && ! $tenant->subscriptions()->where('reference', 'SUB-DEMO-000')->exists()) {
            $tenant->subscriptions()->create([
                'plan_id' => Plan::where('code', 'starter')->value('id') ?? $tenant->plan_id,
                'starts_at' => now()->subYear()->startOfYear(),
                'ends_at' => now()->subYear()->endOfYear(),
                'amount' => 600000,
                'status' => 'expired',
                'reference' => 'SUB-DEMO-000',
                'paid_at' => now()->subYear()->startOfYear()->addDays(5),
            ]);
        }
    }

    /** Two further tenants so the SaaS console has a realistic mix of statuses. */
    private function seedOtherTenants(): void
    {
        $provisioner = app(SchoolProvisioner::class);
        $starter = Plan::where('code', 'starter')->first();
        $trial = Plan::where('code', 'trial')->first();

        if (! User::where('email', 'admin@kilimanjarogirls.test')->exists()) {
            $result = $provisioner->provision([
                'school_name' => 'Kilimanjaro Girls High School',
                'admin_name' => 'Sr. Agnes Massawe',
                'email' => 'admin@kilimanjarogirls.test',
                'password' => 'password',
                'phone' => '+255 767 220 410',
                'level' => 'secondary',
                'residence_type' => 'boarding',
                'region' => 'Kilimanjaro',
            ], $trial);

            $tenant = $result['tenant'];
            $tenant->forceFill(['created_at' => now()->subDays(18), 'trial_ends_at' => now()->addDays(12)])->save();
            $result['school']->update(['code' => 'KGHS', 'registration_no' => 'S.2210', 'motto' => 'Knowledge and Virtue', 'address' => 'P.O. Box 88, Moshi']);

            $tenant->subscriptions()->create([
                'plan_id' => $starter?->id ?? $tenant->plan_id,
                'starts_at' => now()->addDays(13),
                'ends_at' => now()->addDays(13)->addYear()->subDay(),
                'amount' => 600000,
                'status' => 'pending',
                'reference' => 'SUB-'.now()->format('ymd').'-KGHS',
            ]);

            SupportTicket::create([
                'tenant_id' => $tenant->id,
                'created_by' => $result['admin']->id,
                'subject' => 'Help importing 420 students from Excel',
                'description' => 'We have our student register in Excel (names, admission numbers, guardians). Can you help us import it before the trial ends?',
                'priority' => 'high',
                'status' => 'open',
            ]);
        }

        if (! User::where('email', 'admin@pwaniacademy.test')->exists()) {
            $result = $provisioner->provision([
                'school_name' => 'Pwani Academy',
                'admin_name' => 'Mwalimu Salim Bakari',
                'email' => 'admin@pwaniacademy.test',
                'password' => 'password',
                'phone' => '+255 713 450 908',
                'level' => 'primary',
                'residence_type' => 'day',
                'region' => 'Pwani',
            ], $starter);

            $tenant = $result['tenant'];
            $tenant->forceFill([
                'status' => 'suspended',
                'created_at' => now()->subMonths(14),
                'trial_ends_at' => now()->subMonths(13),
                'subscription_ends_at' => now()->subDays(45),
            ])->save();
            $result['school']->update(['code' => 'PWA', 'address' => 'P.O. Box 30, Kibaha']);

            $tenant->subscriptions()->create([
                'plan_id' => $starter?->id ?? $tenant->plan_id,
                'starts_at' => now()->subMonths(13)->subDays(45),
                'ends_at' => now()->subDays(45),
                'amount' => 600000,
                'status' => 'expired',
                'reference' => 'SUB-PWA-0001',
                'paid_at' => now()->subMonths(13)->subDays(40),
            ]);
            $tenant->subscriptions()->create([
                'plan_id' => $starter?->id ?? $tenant->plan_id,
                'starts_at' => now()->subDays(44),
                'ends_at' => now()->subDays(44)->addYear(),
                'amount' => 600000,
                'status' => 'pending',
                'reference' => 'SUB-PWA-0002',
            ]);

            DB::table('audit_logs')->insert([
                'tenant_id' => null,
                'school_id' => null,
                'user_id' => User::where('email', 'superadmin@mzenzi.test')->value('id'),
                'action' => 'tenant_suspend',
                'module' => 'saas',
                'auditable_type' => $tenant->getMorphClass(),
                'auditable_id' => $tenant->id,
                'description' => 'Suspend tenant Pwani Academy (grace → suspended): subscription unpaid 30 days after expiry; data retained.',
                'created_at' => now()->subDays(15),
            ]);
        }

        // Spread demo tenant creation so the growth chart has history.
        Tenant::where('name', 'Mzenzi Secondary School')->where('created_at', '>', now()->subMonths(6))
            ->update(['created_at' => now()->subMonths(10)]);
    }

    private function seedNotifications(): void
    {
        $admin = User::where('email', 'admin@mzenzi.test')->first();
        $parent = User::where('email', 'parent@mzenzi.test')->first();

        if ($admin && ! $admin->notifications()->exists()) {
            foreach ([
                ['Support ticket #'.(SupportTicket::where('tenant_id', $admin->tenant_id)->where('status', 'resolved')->value('id') ?? 1).' resolved', 'Payroll posting issue resolved — the September period was re-opened.', '/admin/subscription', 'success'],
                ['SMS credits used this month', 'Your school has used part of its monthly SMS allowance. Review usage under Communication.', '/communication/messages', 'info'],
                ['Parents meeting announcement published', 'Parents meeting — Saturday 19th October was sent to all parent accounts.', '/communication/announcements', 'info'],
                ['Fee reminder sent', 'Fee reminders were sent to parents of students with balances above TZS 100,000.', '/communication/messages', 'success'],
            ] as [$title, $message, $url, $type]) {
                $admin->notify(new SchoolNotification($title, $message, $url, $type));
            }
        }

        if ($parent && ! $parent->notifications()->exists()) {
            foreach ([
                ['URGENT: Fee payment reminder — Term II', 'Parents are reminded that Term II fees were due on 15th July. Please clear outstanding balances.', '/portal', 'error'],
                ['Parents meeting — Saturday 19th October', 'All parents are invited to the termly general meeting in the school hall at 9:00am.', '/portal', 'warning'],
                ['Mid-term results published', 'Mid-term examination results are now available on the parent portal.', '/portal', 'info'],
                ['Inter-house sports day', 'Annual sports day on Friday 25th October from 8:00am. Parents are welcome.', '/portal', 'info'],
            ] as [$title, $message, $url, $type]) {
                $parent->notify(new SchoolNotification($title, $message, $url, $type));
            }
        }
    }
}
