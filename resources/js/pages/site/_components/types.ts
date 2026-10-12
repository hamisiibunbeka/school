/** Props shared by the public school website pages (see App\Services\Website\SiteContent). */

export type TemplateKey = 'modern' | 'classic' | 'minimal' | 'playful';

/** portal marks the login/dashboard link into the school system. */
export type NavItem = { label: string; href: string; portal?: boolean };

export type SiteChrome = {
    slug: string;
    base: string;
    name: string;
    motto: string | null;
    tagline: string | null;
    logo_url: string | null;
    template: TemplateKey;
    colors: { primary: string | null; secondary: string | null };
    contact: { phone?: string | null; email?: string | null; address?: string | null; office_hours?: string | null; map_embed_url?: string | null };
    social: Partial<Record<'facebook' | 'instagram' | 'x' | 'youtube' | 'whatsapp' | 'linkedin', string>>;
    nav: NavItem[];
    admissions_open: boolean;
    show_branding: boolean;
    platform: string;
    seo: { title: string; description: string | null };
    is_preview: boolean;
    year: number;
};

export type PostCard = {
    slug: string;
    type: 'news' | 'event' | 'notice' | string;
    title: string;
    excerpt: string | null;
    cover_url: string | null;
    published_at: string | null;
    event_starts_at: string | null;
    event_location: string | null;
    href: string;
};

export type EventItem = { title: string; starts_at: string; location: string | null; type: string | null; href: string | null };
export type Notice = { title: string; body: string | null; priority: string | null; date: string | null };
export type GalleryImage = { id: number; url: string | null; title: string | null; caption: string | null; album: string | null };
export type Testimonial = { name: string; role?: string | null; quote: string };
export type Faq = { question: string; answer: string };
export type Highlight = { icon?: string | null; title: string; text?: string | null };
export type Stats = { students: number; teachers: number; classes: number; subjects: number; years: number | null };
export type Leader = { name: string | null; title: string | null; message: string; photo_url: string | null };

export type HomeData = {
    hero: { title: string; subtitle: string | null; image_url: string | null };
    about: { title: string | null; excerpt: string | null; image_url: string | null };
    mission: string | null;
    vision: string | null;
    values: string[];
    highlights: Highlight[];
    stats: Stats | null;
    leader: Leader | null;
    news: PostCard[];
    events: EventItem[];
    notices: Notice[];
    gallery: GalleryImage[];
    testimonials: Testimonial[];
    faqs: Faq[];
};

export type AboutData = {
    title: string;
    body: string | null;
    image_url: string | null;
    mission: string | null;
    vision: string | null;
    values: string[];
    leader: Leader | null;
    stats: Stats;
    registration_no: string | null;
    level: string | null;
    residence_type: string | null;
};

export type FeeGroup = { class: string; items: { category: string; term: string | null; residence: string | null; amount: string }[] };

export type AcademicsData = {
    classes: { name: string; streams: number; subjects: string[] }[];
    subjects: Record<string, { name: string; type: string | null }[]>;
    fees: FeeGroup[];
    calendar: { name: string; start_date: string; end_date: string }[];
};

export type Option = { value: string | number; label: string };

export type AdmissionData = {
    open: boolean;
    intro: string | null;
    fee_note: string | null;
    closing_date: string | null;
    year: string | null;
    classes: Option[];
    residence_options: Option[];
    documents: { enabled: boolean; required: boolean; max_files?: number; max_mb?: number };
    fees: FeeGroup[];
};

export type ApplicationSummary = {
    application_no: string;
    tracking_code: string;
    name: string;
    class: string | null;
    status: string;
    status_label: string;
    submitted_at: string | null;
    interview_date: string | null;
};

export type Paginated<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    total: number;
    from: number | null;
    to: number | null;
    links: { url: string | null; label: string; active: boolean }[];
};
