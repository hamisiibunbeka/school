export type AuthUser = {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    avatar_url: string | null;
    is_super_admin: boolean;
    role: string | null;
    role_slug: string | null;
    two_factor_enabled: boolean;
};

export type CurrentSchool = {
    id: number;
    name: string;
    motto: string | null;
    logo_url: string | null;
    currency: string;
    tenant: string | null;
    tenant_status: string | null;
    plan: string | null;
};

export type SharedProps = {
    name: string;
    auth: { user: AuthUser | null; permissions: string[] };
    school: CurrentSchool | null;
    schools: { id: number; name: string }[];
    notificationsCount: number;
    errors: Record<string, string>;
};

/** Laravel LengthAwarePaginator serialised by Inertia. */
export type Paginated<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
    links: { url: string | null; label: string; active: boolean }[];
};

export type Option = { value: string | number; label: string };

export type BreadcrumbItem = { title: string; href?: string };
