<?php

namespace Database\Seeders;

use App\Models\AcademicYear;
use App\Models\AdmissionApplication;
use App\Models\SchoolClass;
use App\Models\User;
use App\Models\WebsiteInquiry;
use App\Models\WebsitePage;
use App\Models\WebsitePost;
use App\Services\DocumentNumber;
use App\Services\Website\WebsiteDefaults;
use App\Support\Tenancy;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * Published demo website for Mzenzi Secondary School: custom pages, news,
 * events, notices, contact enquiries and a few online admission applications.
 *
 * Runs inside the demo school's tenancy context (see DatabaseSeeder).
 */
class WebsiteDemoSeeder extends Seeder
{
    public function run(): void
    {
        $school = app(Tenancy::class)->school();
        $website = WebsiteDefaults::ensure($school);
        $author = User::where('email', 'admin@mzenzi.test')->value('id');

        $website->forceFill([
            'template' => 'modern',
            'is_published' => true,
            'published_at' => now()->subMonths(2),
            'primary_color' => '#4361ee',
            'secondary_color' => '#805dca',
            'head_name' => 'Dr. Agnes Kimaro',
            'head_title' => 'Head of School',
            'contact' => array_merge($website->contact ?? [], [
                'office_hours' => 'Monday – Friday, 7:30 – 16:30 · Saturday 8:00 – 12:00',
                'map_embed_url' => 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d126915.0!2d39.2083!3d-6.7924!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1',
            ]),
            'social' => ['facebook' => 'https://facebook.com/mzenzisecondary', 'instagram' => 'https://instagram.com/mzenzisecondary', 'x' => null, 'youtube' => 'https://youtube.com/@mzenzisecondary', 'whatsapp' => null],
            'sections' => array_merge($website->sections ?? [], ['fees' => true]),
        ])->save();

        $pages = [
            ['Boarding Life', 'boarding-life', 'Safe, structured and caring boarding for boys and girls from Form One to Form Six.', '<h2>A home away from home</h2><p>Our boarding houses are supervised day and night by trained patrons and matrons. Students follow a balanced routine of prep, meals, sports and rest.</p><ul><li>Separate boys’ and girls’ dormitories</li><li>Three nutritious meals and evening tea daily</li><li>Supervised evening preparation (prep) sessions</li><li>On-site sick bay with a qualified nurse</li></ul><h3>Visiting days</h3><p>Parents may visit on the first Sunday of each month between 10:00 and 16:00.</p>'],
            ['School Uniform', 'school-uniform', 'Official uniform requirements for day and boarding students.', '<h2>Uniform</h2><p>Uniform is available from the school shop and approved suppliers.</p><ul><li>Navy blue trousers / skirt</li><li>Sky-blue shirt with the school badge</li><li>Navy sweater (cold season)</li><li>Black leather shoes, white socks</li></ul><p><strong>Sports kit:</strong> house T-shirt, navy shorts and white sports shoes.</p>'],
            ['Clubs & Societies', 'clubs-and-societies', 'Debate, science, environment, music, scouts and more.', '<h2>Beyond the classroom</h2><p>Every student joins at least one club. Clubs meet on Wednesday afternoons.</p><ul><li>Debate & Public Speaking (English and Kiswahili)</li><li>Young Scientists</li><li>Environmental & Tree Planting Club</li><li>Choir and Traditional Dance</li><li>Scouts and Girl Guides</li><li>ICT & Coding Club</li></ul>'],
        ];
        foreach ($pages as $i => [$title, $slug, $summary, $body]) {
            WebsitePage::updateOrCreate(['slug' => $slug], ['title' => $title, 'summary' => $summary, 'body' => $body, 'show_in_menu' => true, 'is_published' => true, 'sort' => $i]);
        }

        $posts = [
            ['news', 'Form Four 2025 results: 96% scored Division I–II', 'Our candidates delivered the best results in the school’s history, with 41 Division I passes.', 12, true],
            ['news', 'Mzenzi wins the regional inter-school debate championship', 'Our Form Five debaters beat 18 schools to lift the trophy in Dar es Salaam.', 26, false],
            ['news', 'New science laboratory opened', 'The modern physics and chemistry lab, funded by parents and alumni, is now in use.', 45, false],
            ['news', 'Tree planting day: 500 seedlings planted', 'Students and staff planted indigenous trees around the campus and in the local community.', 70, false],
            ['notice', 'Term II fees deadline', 'Parents are reminded that Term II fees are due before the opening date. Pay via bank or mobile money quoting the admission number.', 5, false],
        ];
        foreach ($posts as [$type, $title, $excerpt, $daysAgo, $featured]) {
            WebsitePost::updateOrCreate(['slug' => Str::slug($title)], [
                'type' => $type,
                'title' => $title,
                'excerpt' => $excerpt,
                'body' => "<p>{$excerpt}</p><p>The school management congratulates students, teachers and parents for their commitment and support. We will continue working together to raise standards even higher.</p>",
                'status' => 'published',
                'is_featured' => $featured,
                'published_at' => now()->subDays($daysAgo),
                'created_by' => $author,
            ]);
        }

        $events = [
            ['Open Day for Form One 2027 applicants', 18, 'School main hall', 'Meet teachers, tour the campus and boarding houses, and get help with the online application.'],
            ['Annual Sports Day', 32, 'School sports grounds', 'Inter-house athletics, football and netball finals. Parents are warmly invited.'],
            ['Graduation ceremony — Form Four & Six', 55, 'School main hall', 'Celebrating our graduating classes with parents, guests and alumni.'],
        ];
        foreach ($events as [$title, $inDays, $location, $excerpt]) {
            $start = now()->addDays($inDays)->setTime(9, 0);
            WebsitePost::updateOrCreate(['slug' => Str::slug($title)], [
                'type' => 'event',
                'title' => $title,
                'excerpt' => $excerpt,
                'body' => "<p>{$excerpt}</p>",
                'status' => 'published',
                'published_at' => now()->subDays(3),
                'event_starts_at' => $start,
                'event_ends_at' => $start->copy()->setTime(15, 0),
                'event_location' => $location,
                'created_by' => $author,
            ]);
        }

        if (WebsiteInquiry::count() === 0) {
            foreach ([
                ['Joseph Mrema', 'joseph.mrema@gmail.com', '+255754112233', 'Form Five combinations', 'Good morning. Which A-Level combinations do you offer for 2027 and is PCM available for boarders?', 'new', 1],
                ['Halima Said', null, '+255713445566', 'Transfer to Form Two', 'My daughter is in Form One at another school. Do you accept transfers in Term II?', 'new', 3],
                ['Peter Lyimo', 'plyimo@yahoo.com', null, 'School bus routes', 'Does the school bus pass through Goba and Madale?', 'replied', 9],
            ] as [$name, $email, $phone, $subject, $message, $status, $daysAgo]) {
                $inquiry = WebsiteInquiry::create(compact('name', 'email', 'phone', 'subject', 'message', 'status') + ['ip_address' => '127.0.0.1']);
                $inquiry->forceFill(['created_at' => now()->subDays($daysAgo)])->save();
            }
        }

        if (AdmissionApplication::where('source', 'online')->doesntExist()) {
            $year = AcademicYear::orderByDesc('start_date')->first();
            $formOne = SchoolClass::orderBy('level')->first();
            foreach ([
                ['Neema', 'Rose', 'Massawe', 'female', 'Grace Massawe', 'Mother', 'Teacher', 'boarding', 0],
                ['Baraka', 'John', 'Mwakyusa', 'male', 'John Mwakyusa', 'Father', 'Engineer', 'day', 1],
                ['Zawadi', null, 'Kombo', 'female', 'Saida Kombo', 'Mother', 'Business woman', 'boarding', 2],
                ['Amani', 'Elia', 'Shirima', 'male', 'Elia Shirima', 'Father', 'Farmer', 'day', 6],
            ] as [$first, $middle, $last, $gender, $guardian, $relation, $occupation, $residence, $daysAgo]) {
                $application = new AdmissionApplication([
                    'academic_year_id' => $year?->id,
                    'school_class_id' => $formOne?->id,
                    'first_name' => $first,
                    'middle_name' => $middle,
                    'last_name' => $last,
                    'gender' => $gender,
                    'date_of_birth' => now()->subYears(13)->subDays(40 * ($daysAgo + 1))->toDateString(),
                    'residence_type' => $residence,
                    'previous_school' => 'Mbezi Beach Primary School',
                    'guardian_name' => $guardian,
                    'guardian_relationship' => $relation,
                    'guardian_occupation' => $occupation,
                    'guardian_phone' => '+2557'.random_int(10000000, 99999999),
                    'guardian_email' => strtolower(Str::before($guardian, ' ')).'.'.strtolower($last).'@gmail.com',
                    'nationality' => 'Tanzanian',
                    'address' => 'Mbezi Beach, Kinondoni, Dar es Salaam',
                ]);
                $application->application_no = DocumentNumber::next('application');
                $application->status = $daysAgo > 3 ? 'under_review' : 'submitted';
                $application->source = 'online';
                $application->tracking_code = strtoupper(Str::random(8));
                $application->submitted_ip = '127.0.0.1';
                $application->created_at = now()->subDays($daysAgo)->setTime(19, 20);
                $application->save();
            }
        }
    }
}
