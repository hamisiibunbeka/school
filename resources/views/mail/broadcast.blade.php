<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f1f2f3;font-family:Arial,Helvetica,sans-serif;color:#0e1726;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr>
            <td style="background:#4361ee;padding:20px 24px;color:#ffffff;">
                <div style="font-size:18px;font-weight:bold;">{{ $school?->name ?? config('app.name') }}</div>
                @if ($school?->motto)
                    <div style="font-size:12px;opacity:.85;font-style:italic;">“{{ $school->motto }}”</div>
                @endif
            </td>
        </tr>
        <tr>
            <td style="padding:24px;">
                <h2 style="margin:0 0 16px;font-size:18px;">{{ $subjectLine }}</h2>
                <div style="font-size:14px;line-height:1.6;">{!! nl2br(e($body)) !!}</div>
            </td>
        </tr>
        <tr>
            <td style="padding:16px 24px;background:#f8f9fb;font-size:11px;color:#888ea8;">
                {{ $school?->name ?? config('app.name') }}
                @if ($school?->phone) · {{ $school->phone }} @endif
                @if ($school?->email) · {{ $school->email }} @endif
            </td>
        </tr>
    </table>
</body>
</html>
