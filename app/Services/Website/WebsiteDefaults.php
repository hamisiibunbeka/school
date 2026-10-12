<?php

namespace App\Services\Website;

use App\Models\AcademicYear;
use App\Models\School;
use App\Models\SchoolWebsite;
use App\Support\Tenancy;

/** Creates a ready-to-edit website for a school, pre-filled from its own data. */
class WebsiteDefaults
{
    public static function ensure(School $school): SchoolWebsite
    {
        return app(Tenancy::class)->runAs($school, function () use ($school) {
            $existing = SchoolWebsite::first();
            if ($existing) {
                return $existing;
            }

            $level = match ($school->level) {
                'nursery' => 'nursery', 'primary' => 'primary', default => 'secondary',
            };
            $template = $level === 'secondary' ? 'modern' : 'playful';
            if (! WebsiteEntitlements::for($school)->allowsTemplate($template)) {
                $template = WebsiteEntitlements::for($school)->templates()[0];
            }

            return SchoolWebsite::create([
                'template' => $template,
                'is_published' => false,
                'tagline' => $school->motto ?: 'Learning today, leading tomorrow',
                'hero_title' => "Welcome to {$school->name}",
                'hero_subtitle' => 'A caring, disciplined and ambitious learning community where every learner is known, supported and challenged to excel.',
                'about_title' => "About {$school->name}",
                'about_body' => "<p>{$school->name} is committed to academic excellence, strong character and service to the community. Our dedicated teachers, safe environment and modern facilities help every learner reach their full potential.</p><p>We combine the national curriculum with sports, clubs and leadership opportunities so that our students grow into confident, responsible citizens.</p>",
                'mission' => 'To provide quality, holistic education that develops knowledge, skills and values for life.',
                'vision' => 'To be a centre of excellence that nurtures responsible, innovative and successful citizens.',
                'core_values' => "Integrity\nDiscipline\nExcellence\nRespect\nTeamwork",
                'head_title' => 'Head of School',
                'head_message' => 'Welcome! We are proud of our learners and grateful to the parents and partners who make our school a place where every child can thrive. We look forward to welcoming your family.',
                'highlights' => [
                    ['icon' => 'graduation', 'title' => 'Excellent results', 'text' => 'Consistently strong national examination performance.'],
                    ['icon' => 'users', 'title' => 'Qualified teachers', 'text' => 'Dedicated, experienced and caring teaching staff.'],
                    ['icon' => 'flask', 'title' => 'Modern facilities', 'text' => 'Science labs, ICT room, library and sports grounds.'],
                    ['icon' => 'shield', 'title' => 'Safe environment', 'text' => 'A secure campus with strong pastoral care and boarding.'],
                ],
                'testimonials' => [
                    ['name' => 'Mrs. Mariamu K.', 'role' => 'Parent', 'quote' => 'My children are happy, disciplined and their results keep improving. The teachers truly care.'],
                    ['name' => 'Baraka J.', 'role' => 'Alumnus', 'quote' => 'The school prepared me for university and for life. I am proud to be a former student.'],
                ],
                'faqs' => [
                    ['question' => 'When does admission open?', 'answer' => 'Applications for the next academic year are accepted online throughout the year, subject to available places.'],
                    ['question' => 'Do you offer boarding?', 'answer' => $school->residence_type === 'day' ? 'We are a day school.' : 'Yes — we offer both day and boarding places.'],
                    ['question' => 'How do I pay school fees?', 'answer' => 'Fees can be paid by bank deposit or mobile money. Always quote the student admission number as reference.'],
                ],
                'sections' => SchoolWebsite::SECTION_DEFAULTS,
                'contact' => [
                    'phone' => $school->phone,
                    'email' => $school->email,
                    'address' => $school->address,
                    'office_hours' => 'Monday – Friday, 7:30 – 16:30',
                    'map_embed_url' => null,
                ],
                'social' => ['facebook' => null, 'instagram' => null, 'x' => null, 'youtube' => null, 'whatsapp' => null],
                'admission_settings' => [
                    'enabled' => true,
                    'intro' => 'Apply online in a few minutes. Our admissions office will review your application and contact you by phone.',
                    'academic_year_id' => AcademicYear::orderByDesc('start_date')->value('id'),
                    'class_ids' => [],
                    'require_documents' => false,
                    'fee_note' => 'An application review is free. Successful applicants receive an admission letter with fee details.',
                    'closing_date' => null,
                ],
                'seo_title' => $school->name,
                'seo_description' => "{$school->name} — admissions, academics, news and events.",
            ]);
        });
    }
}
