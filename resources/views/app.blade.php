<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">

        {{-- Apply the saved Vristo theme (light | dark | system) before first paint --}}
        <script>
            (function () {
                try {
                    var theme = localStorage.getItem('theme') || 'light';
                    var dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                    if (dark) document.documentElement.classList.add('dark');
                    if (localStorage.getItem('sidebar') === 'collapsed') document.documentElement.classList.add('toggle-sidebar');
                } catch (e) {}
            })();
        </script>

        <style>
            html { background-color: #fafafa; }
            html.dark { background-color: #060818; }
        </style>

        <link rel="icon" href="/favicon.svg" type="image/svg+xml">
        <link rel="icon" href="/favicon.ico" sizes="any">

        @fonts

        @viteReactRefresh
        @vite(['resources/css/app.css', 'resources/js/app.tsx', "resources/js/pages/{$page['component']}.tsx"])
        <x-inertia::head>
            <title>{{ config('app.name', 'Laravel') }}</title>
        </x-inertia::head>
    </head>
    <body class="font-nunito antialiased">
        <x-inertia::app />
    </body>
</html>
