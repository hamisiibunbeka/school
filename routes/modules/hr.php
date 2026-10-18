<?php

use App\Http\Controllers\Hr\DepartmentController;
use App\Http\Controllers\Hr\EmployeeController;
use App\Http\Controllers\Hr\LeaveController;
use App\Http\Controllers\Hr\StaffDutyController;
use App\Http\Controllers\Payroll\PayrollRunController;
use App\Http\Controllers\Payroll\PayslipController;
use App\Http\Controllers\Payroll\SalaryComponentController;
use Illuminate\Support\Facades\Route;

// ---------------- HR (SRS 4.11) ----------------
Route::middleware('can:hr.manage')->group(function () {
    Route::get('hr/employees/create', [EmployeeController::class, 'create'])->name('hr.employees.create');
    Route::post('hr/employees', [EmployeeController::class, 'store'])->name('hr.employees.store');
    Route::get('hr/employees/{employee}/edit', [EmployeeController::class, 'edit'])->name('hr.employees.edit');
    Route::put('hr/employees/{employee}', [EmployeeController::class, 'update'])->name('hr.employees.update');
    Route::delete('hr/employees/{employee}', [EmployeeController::class, 'destroy'])->name('hr.employees.destroy');
    Route::post('hr/employees/{employee}/status', [EmployeeController::class, 'changeStatus'])->name('hr.employees.status');
    Route::post('hr/employees/{employee}/login', [EmployeeController::class, 'createLogin'])->name('hr.employees.login');

    Route::post('hr/departments', [DepartmentController::class, 'store'])->name('hr.departments.store');
    Route::put('hr/departments/{department}', [DepartmentController::class, 'update'])->name('hr.departments.update');
    Route::delete('hr/departments/{department}', [DepartmentController::class, 'destroy'])->name('hr.departments.destroy');

    Route::post('hr/leave/{leave}/approve', [LeaveController::class, 'approve'])->name('hr.leave.approve');
    Route::post('hr/leave/{leave}/reject', [LeaveController::class, 'reject'])->name('hr.leave.reject');
    Route::post('hr/leave-types', [LeaveController::class, 'storeType'])->name('hr.leave-types.store');
    Route::put('hr/leave-types/{type}', [LeaveController::class, 'updateType'])->name('hr.leave-types.update');
    Route::delete('hr/leave-types/{type}', [LeaveController::class, 'destroyType'])->name('hr.leave-types.destroy');

    Route::prefix('hr/duties')->name('hr.duties.')->controller(StaffDutyController::class)->group(function () {
        Route::post('types', 'storeType')->name('types.store');
        Route::put('types/{dutyType}', 'updateType')->name('types.update');
        Route::delete('types/{dutyType}', 'destroyType')->name('types.destroy');
        Route::post('assign', 'assign')->name('assign');
        Route::post('generate', 'generate')->name('generate');
        Route::put('assignments/{dutyAssignment}', 'updateAssignment')->name('assignments.update');
        Route::delete('assignments/{dutyAssignment}', 'destroyAssignment')->name('assignments.destroy');
        Route::post('log', 'log')->name('log');
    });
});

Route::middleware('can:hr.view')->group(function () {
    Route::get('hr/employees', [EmployeeController::class, 'index'])->name('hr.employees.index');
    Route::get('hr/employees/export', [EmployeeController::class, 'export'])->name('hr.employees.export');
    Route::get('hr/employees/{employee}', [EmployeeController::class, 'show'])->name('hr.employees.show');
    Route::get('hr/departments', [DepartmentController::class, 'index'])->name('hr.departments.index');
    Route::get('hr/leave', [LeaveController::class, 'index'])->name('hr.leave.index');
    Route::get('hr/duties', [StaffDutyController::class, 'index'])->name('hr.duties.index');
});

// Any staff member may apply for (or withdraw) their own leave; HR may act for anyone (checked in controller).
Route::post('hr/leave', [LeaveController::class, 'store'])->name('hr.leave.store');
Route::post('hr/leave/{leave}/cancel', [LeaveController::class, 'cancel'])->name('hr.leave.cancel');

// ---------------- Payroll (SRS 4.11 / 13) ----------------
Route::middleware('can:payroll.manage')->group(function () {
    Route::post('payroll/components', [SalaryComponentController::class, 'store'])->name('payroll.components.store');
    Route::put('payroll/components/{component}', [SalaryComponentController::class, 'update'])->name('payroll.components.update');
    Route::delete('payroll/components/{component}', [SalaryComponentController::class, 'destroy'])->name('payroll.components.destroy');
    Route::post('payroll/assignments', [SalaryComponentController::class, 'assign'])->name('payroll.assignments.store');
    Route::put('payroll/assignments/{assignment}', [SalaryComponentController::class, 'updateAssignment'])->name('payroll.assignments.update');
    Route::delete('payroll/assignments/{assignment}', [SalaryComponentController::class, 'unassign'])->name('payroll.assignments.destroy');

    Route::post('payroll', [PayrollRunController::class, 'store'])->name('payroll.runs.store');
    Route::post('payroll/{run}/recalculate', [PayrollRunController::class, 'recalculate'])->name('payroll.runs.recalculate');
    Route::post('payroll/{run}/approve', [PayrollRunController::class, 'approve'])->name('payroll.runs.approve');
    Route::post('payroll/{run}/pay', [PayrollRunController::class, 'pay'])->name('payroll.runs.pay');
    Route::delete('payroll/{run}', [PayrollRunController::class, 'destroy'])->name('payroll.runs.destroy');
});

// Payslip access is checked in the controller (payroll viewers, HR managers or the employee themself).
Route::get('payroll/payslips/{payslip}', [PayslipController::class, 'show'])->name('payroll.payslips.show');

Route::middleware('can:payroll.view')->group(function () {
    Route::get('payroll', [PayrollRunController::class, 'index'])->name('payroll.runs.index');
    Route::get('payroll/components', [SalaryComponentController::class, 'index'])->name('payroll.components.index');
    Route::get('payroll/{run}', [PayrollRunController::class, 'show'])->whereNumber('run')->name('payroll.runs.show');
    Route::get('payroll/{run}/bank-file', [PayrollRunController::class, 'bankFile'])->whereNumber('run')->name('payroll.runs.bank-file');
    Route::get('payroll/{run}/summary', [PayrollRunController::class, 'summary'])->whereNumber('run')->name('payroll.runs.summary');
});
