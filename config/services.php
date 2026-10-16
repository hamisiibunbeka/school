<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Resend, Postmark, AWS, and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    // Outbound SMS. "log" records messages without sending (development); "beem" sends through Beem Africa.
    'sms' => [
        'driver' => env('SMS_DRIVER', 'log'),
    ],

    // Beem Africa SMS (https://docs.beem.africa/guides/sms/index). One platform account; each school
    // may use its own approved sender ID (School Settings → General → SMS sender ID).
    'beem' => [
        'api_key' => env('BEEM_API_KEY'),
        'secret_key' => env('BEEM_SECRET_KEY'),
        'sender_id' => env('BEEM_SENDER_ID', 'INFO'),
        'base_url' => env('BEEM_BASE_URL', 'https://apisms.beem.africa'),
        'dlr_url' => env('BEEM_DLR_URL', 'https://dlrapi.beem.africa'),
        'timeout' => (int) env('BEEM_TIMEOUT', 20),
    ],

];
