<?php

namespace App\Models;

class MessageTemplate extends SchoolModel
{
    /** Variables that can be used inside template bodies. */
    public const VARIABLES = ['{student_name}', '{guardian_name}', '{balance}', '{school_name}', '{class}'];
}
