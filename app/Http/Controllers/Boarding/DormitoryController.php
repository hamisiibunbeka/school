<?php

namespace App\Http\Controllers\Boarding;

use App\Http\Controllers\Controller;
use App\Models\BedAllocation;
use App\Models\Dormitory;
use App\Models\DormitoryCaretaker;
use App\Models\DormitoryRoom;
use App\Models\LeavePass;
use App\Models\Student;
use App\Support\Lookups;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class DormitoryController extends Controller
{
    public function index(Request $request): Response
    {
        $dormitories = Dormitory::query()
            ->with(['caretakers.employee:id,first_name,last_name,phone,gender', 'rooms' => fn ($q) => $q->withCount('activeAllocations')])
            ->orderBy('name')
            ->get()
            ->map(function (Dormitory $d) {
                $occupied = $d->rooms->sum('active_allocations_count');

                return [
                    'id' => $d->id,
                    'name' => $d->name,
                    'gender' => $d->gender,
                    'capacity' => (int) $d->capacity,
                    'occupied' => (int) $occupied,
                    'description' => $d->description,
                    'caretakers' => $d->caretakers->map(fn (DormitoryCaretaker $c) => [
                        'employee_id' => $c->employee_id,
                        'role' => $c->role,
                        'name' => $c->employee?->full_name,
                        'phone' => $c->employee?->phone,
                    ])->values(),
                    'rooms' => $d->rooms->map(fn (DormitoryRoom $r) => [
                        'id' => $r->id,
                        'name' => $r->name,
                        'capacity' => (int) $r->capacity,
                        'occupied' => (int) $r->active_allocations_count,
                    ])->values(),
                ];
            });

        $capacity = $dormitories->sum('capacity');
        $occupied = $dormitories->sum('occupied');
        $boarders = Student::active()->where('residence_type', 'boarding')->count();

        return Inertia::render('boarding/dormitories', [
            'dormitories' => $dormitories->values(),
            'staff' => Lookups::employees(),
            'stats' => [
                'dormitories' => $dormitories->count(),
                'rooms' => $dormitories->sum(fn ($d) => count($d['rooms'])),
                'capacity' => $capacity,
                'occupied' => $occupied,
                'boarders' => $boarders,
                'unallocated' => max(0, $boarders - BedAllocation::active()->whereHas('student', fn ($q) => $q->active()->where('residence_type', 'boarding'))->count()),
                'out_on_leave' => LeavePass::where('status', 'out')->count(),
                'overdue' => LeavePass::overdue()->count(),
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);
        $dormitory = DB::transaction(function () use ($data) {
            $dormitory = Dormitory::create(collect($data)->except('caretakers')->all());
            $this->syncCaretakers($dormitory, $data['caretakers'] ?? []);

            return $dormitory;
        });
        $this->audit('created', $dormitory, "Dormitory {$dormitory->name} created", 'boarding');
        $this->toast('Dormitory created. Add rooms to set its capacity.');

        return back();
    }

    public function update(Request $request, Dormitory $dormitory): RedirectResponse
    {
        $data = $this->validated($request);

        if ($data['gender'] !== 'mixed' && $data['gender'] !== $dormitory->gender) {
            $mismatch = BedAllocation::active()
                ->whereIn('dormitory_room_id', $dormitory->rooms()->pluck('id'))
                ->whereHas('student', fn ($q) => $q->where('gender', '!=', $data['gender']))
                ->exists();
            if ($mismatch) {
                return back()->withErrors(['gender' => 'Students of another gender are allocated here. Move them before changing the policy.']);
            }
        }

        $fields = collect($data)->except('caretakers')->all();
        $old = $dormitory->only(array_keys($fields)) + ['caretakers' => $this->caretakerSummary($dormitory)];
        DB::transaction(function () use ($dormitory, $fields, $data) {
            $dormitory->update($fields);
            $this->syncCaretakers($dormitory, $data['caretakers'] ?? []);
        });
        $this->audit('updated', $dormitory, "Dormitory {$dormitory->name} updated", 'boarding', $old, $fields + ['caretakers' => $this->caretakerSummary($dormitory)]);
        $this->toast('Dormitory updated.');

        return back();
    }

    public function destroy(Dormitory $dormitory): RedirectResponse
    {
        if (BedAllocation::active()->whereIn('dormitory_room_id', $dormitory->rooms()->pluck('id'))->exists()) {
            $this->toast('This dormitory still has students allocated. End or transfer their allocations first.', 'error');

            return back();
        }

        $this->audit('deleted', $dormitory, "Dormitory {$dormitory->name} deleted", 'boarding');
        $dormitory->delete();
        $this->toast('Dormitory deleted.');

        return back();
    }

    public function storeRoom(Request $request, Dormitory $dormitory): RedirectResponse
    {
        $data = $this->validatedRoom($request, $dormitory);
        $room = $dormitory->rooms()->create($data);
        $dormitory->syncCapacity();
        $this->audit('created', $room, "Room {$room->name} added to {$dormitory->name}", 'boarding');
        $this->toast('Room added.');

        return back();
    }

    public function updateRoom(Request $request, DormitoryRoom $room): RedirectResponse
    {
        $data = $this->validatedRoom($request, $room->dormitory, $room);
        $occupied = $room->activeAllocations()->count();
        if ($data['capacity'] < $occupied) {
            return back()->withErrors(['capacity' => "Capacity cannot be below the {$occupied} students currently allocated."]);
        }

        $room->update($data);
        $room->dormitory->syncCapacity();
        $this->toast('Room updated.');

        return back();
    }

    public function destroyRoom(DormitoryRoom $room): RedirectResponse
    {
        if ($room->activeAllocations()->exists()) {
            $this->toast('This room has students allocated. End or transfer them first.', 'error');

            return back();
        }

        $dormitory = $room->dormitory;
        $this->audit('deleted', $room, "Room {$room->name} removed from {$dormitory->name}", 'boarding');
        $room->delete();
        $dormitory->syncCapacity();
        $this->toast('Room removed.');

        return back();
    }

    /** @return array<string, mixed> */
    private function validated(Request $request): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'gender' => ['required', Rule::in(Dormitory::GENDERS)],
            'description' => ['nullable', 'string', 'max:255'],
            'caretakers' => ['nullable', 'array', 'max:10'],
            'caretakers.*.employee_id' => ['required', 'distinct', Rule::exists('employees', 'id')->where('school_id', $this->tenancy()->schoolId())],
            'caretakers.*.role' => ['required', Rule::in(DormitoryCaretaker::ROLES)],
        ], ['caretakers.*.employee_id.distinct' => 'The same person is listed twice.'], ['caretakers.*.employee_id' => 'staff member', 'caretakers.*.role' => 'role']);
        $data['caretakers'] = array_values($data['caretakers'] ?? []);

        return $data;
    }

    /** Replace the dormitory's patrons / matrons / assistants. */
    private function syncCaretakers(Dormitory $dormitory, array $caretakers): void
    {
        $dormitory->caretakers()->delete();
        foreach ($caretakers as $c) {
            $dormitory->caretakers()->create(['employee_id' => $c['employee_id'], 'role' => $c['role']]);
        }
        $dormitory->unsetRelation('caretakers');
    }

    private function caretakerSummary(Dormitory $dormitory): string
    {
        return $dormitory->caretakers()->with('employee:id,first_name,last_name')->get()
            ->map(fn (DormitoryCaretaker $c) => "{$c->employee?->full_name} ({$c->role})")->implode(', ');
    }

    /** @return array<string, mixed> */
    private function validatedRoom(Request $request, Dormitory $dormitory, ?DormitoryRoom $room = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:60', Rule::unique('dormitory_rooms', 'name')->where('dormitory_id', $dormitory->id)->ignore($room?->id)],
            'capacity' => ['required', 'integer', 'min:1', 'max:200'],
        ]);
    }
}
