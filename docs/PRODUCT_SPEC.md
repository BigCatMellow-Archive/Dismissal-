# Dismissal Product Specification

## Goal

Replace repeated verbal carpool coordination with a shared live dismissal queue. Scanning one family or pickup-group barcode calls every currently enrolled student assigned to that group. Each student then moves independently through the dismissal workflow until pickup is complete.

The product is designed for a busy school dismissal with roughly 600 students. It must be usable correctly by a staff member who has never seen it before and receives little or no training.

## Operational UX rules

These are product requirements, not visual preferences.

1. **Mobile first.** Every operational screen must work comfortably one-handed on a phone before desktop layout is considered.
2. **One obvious job per screen.** Scanner scans. Runner gets students. Dispatcher handles arrivals and exceptions. Setup stays in Admin.
3. **One obvious action at a time.** Do not place a row of status buttons on every student. Tapping a student opens a modal with only the actions that make sense for that student at that moment.
4. **No memorized workflow.** The interface tells the user the next step. Staff should not need to remember status names or process order.
5. **Large touch targets.** Primary operational controls should be at least about 56px high, separated enough to avoid accidental taps.
6. **No normal-operation typing.** Barcode scanning and large tap actions are the default. Typing is a fallback or administrative task.
7. **Hide uncommon choices.** Backup scanning, manual entry, screen switching, reset tools, and administrative actions belong behind a menu or modal.
8. **Prefer automatic ordering to filters.** Exceptions and long waits should rise automatically. Do not make staff configure views during dismissal.
9. **Do not browse the full school roster.** A 600-student roster belongs in searchable admin data, not the live operational interface.
10. **Use plain language.** Prefer “Student is on the way” over internal state names such as `ON_WAY`.
11. **Make mistakes recoverable.** Duplicate scans do not create duplicate calls. A runner can release an accidental claim. Destructive/setup actions require confirmation.
12. **Do not rely on color alone.** Warning colors support explicit text such as “Needs attention” or “Can't find.”
13. **Keep the scanner ready.** Hardware scanning should not require touching the screen between vehicles, and focus must return automatically after backup dialogs close.
14. **Operational roles should be locked in production.** The prototype menu allows easy testing, but authenticated production users should normally land directly on the screen their role permits.

## Core workflow

1. A vehicle reaches the scan point.
2. Staff scans the pickup-group barcode.
3. The system resolves that opaque code to one pickup group.
4. All eligible students in that group are placed in the active dismissal queue.
5. Every connected staff screen receives the update.
6. An available student appears on runner screens.
7. A runner taps the student and confirms “I'm getting them.”
8. That student is removed from other runners' available work and stays visible to the runner who claimed them until the runner marks them on the way or reports that they cannot be found.
9. The dispatcher continues to see the entire active queue, including students already being handled.
10. The dispatcher marks the student complete when the student reaches pickup.
11. Wait time is calculated from the original scan time.
12. Exceptions become visually prominent and rise in priority as the wait grows.
13. All status changes are written to an event history for later operational reporting.

## Roles

### Scanner

Normal screen:

- keep the hardware barcode scanner ready without requiring taps between cars
- scan a family/pickup-group pass
- briefly confirm the pickup group and students triggered
- immediately return to ready state
- show when a student was already active rather than creating a duplicate

Fallback actions, kept out of the normal flow:

- scan with a phone camera
- manually type a pickup code
- use fictional demo passes in prototype mode

### Runner / inside staff

The runner screen should show only work relevant to that runner:

- unclaimed students who need someone
- students currently claimed by that runner and still requiring an action

Students being handled by other runners should not clutter the normal runner queue. A runner should not need filters to create this view.

Runner actions are progressive:

- tap an available student → **I'm getting them**
- tap a claimed student → **Student is on the way** or **I can't find them**
- tap a can't-find student → **Found them — on the way**
- accidental claim → **Release student**

Once the runner marks a student on the way, that student's operational responsibility moves back to the dispatcher and the student can leave the runner's work list.

### Dispatcher

- see the entire active queue
- see elapsed wait time
- automatically see problem/long-wait students first
- see who claimed a student
- see students already on the way
- tap a student to mark **Student is here**
- tap a student to **Call again**
- eventually manage vehicle/waiting-area escalation

The dispatcher should not have persistent action buttons on every row. The queue itself is the information display; actions appear after tapping the relevant student.

### Administrator

- search rather than scroll through a large roster
- import and maintain students
- maintain pickup groups
- associate one student with multiple authorized pickup groups when necessary
- issue or replace barcode tokens
- deactivate old groups/tokens
- manage staff roles
- configure warning/escalation times
- review aggregate dismissal metrics

When the roster is large, Admin should not render hundreds of pickup groups by default. The user should search by family, student, barcode, grade, or homeroom.

## Pickup groups, not just families

The scannable object is a `pickup_group`. Most pickup groups will represent one family, but the same model also supports carpools and other approved pickup arrangements without changing the student table.

A barcode contains only an opaque lookup token. It should not directly encode a student name, grade, homeroom, or internal student identifier.

## Duplicate and concurrency behavior

A rescan must never create another simultaneous active dismissal for the same student. Instead it should surface the student's current state and record a rescan event.

Production must also protect runner claims from races between devices. A claim should succeed only if the student is still unclaimed at the moment the database update occurs; if another runner won the claim first, the second device should refresh rather than silently overwrite the first runner.

Production should define whether a student can be called a second time after being completed in the same daily dismissal session. The safer default is one completed pickup per student per session unless an authorized dispatcher explicitly reopens it.

## Timing

Initial visual defaults:

- under 5 minutes: normal
- 5–9:59: warning
- 10+ minutes: needs attention and moves ahead of normal queue items

These should become administrator-configurable settings rather than permanent hard-coded values.

## Scale requirements

The system may contain approximately 600 active students, but scale should be handled by narrowing context rather than exposing more controls.

- scanner lookup is by barcode token, not roster browsing
- runner screens show only currently actionable students
- dispatcher shows only today's active dismissal queue
- admin uses indexed search for the full roster and pickup groups
- completed records leave operational queues immediately
- real-time subscriptions should transmit only changes needed by the current screen
- production database indexes should support barcode lookup, active-session queue queries, and student/pickup-group search

## Reporting

Useful operational measures include:

- cars/pickup groups scanned by time interval
- median and percentile wait time
- number of students requiring a repeat call
- number of `can't find` events
- number of active students at peak load
- dismissal duration by grade/homeroom in aggregate

Reports should be used to identify process bottlenecks, not rank individual students or staff.

## Production privacy requirements

The current GitHub prototype contains fictional records only. Before real school data is used:

- require authenticated staff access
- apply role-based database policies
- keep barcode tokens opaque and revocable
- do not put student records into the public repository
- use HTTPS
- define a retention period for dismissal history
- limit historical reporting access
- hide Admin and unrelated operational screens from roles that do not need them
- review the deployment and data handling with the school before launch
