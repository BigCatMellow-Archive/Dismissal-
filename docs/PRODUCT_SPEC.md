# Dismissal Product Specification

## Goal

Replace repeated verbal carpool coordination with a shared live dismissal queue. Scanning one family or pickup-group barcode calls every currently enrolled student assigned to that group. Each student then moves independently through the dismissal workflow until pickup is complete.

## Core workflow

1. A vehicle reaches the scan point.
2. Staff scans the pickup-group barcode.
3. The system resolves that opaque code to one pickup group.
4. All eligible students in that group are placed in the active dismissal queue.
5. Every connected staff screen receives the update.
6. A runner can claim a student so other staff know who is handling that request.
7. Staff update the student through `Called`, `Claimed`, `On the way`, `Can't find`, `Call again`, `At pickup`, and `Complete`.
8. Wait time is calculated from the original scan time.
9. Exceptions become visually prominent as the wait grows.
10. All status changes are written to an event history for later operational reporting.

## Roles

### Scanner

- scan hardware barcodes quickly without touching the screen between cars
- optionally scan a QR code with a phone camera
- see the pickup-group name and students triggered by the scan
- see when a student is already active rather than creating duplicates
- manually type a code as a fallback

### Runner / inside staff

- see every student currently waiting
- see grade and homeroom
- see elapsed wait time
- claim a student
- mark the student on the way
- report that the student cannot be found
- complete the pickup

### Dispatcher

- see the entire active queue
- see students needing attention
- see students over configured wait thresholds
- call a student again
- complete a dismissal
- eventually manage vehicle/waiting-area escalation

### Administrator

- import and maintain students
- maintain pickup groups
- associate one student with multiple authorized pickup groups when necessary
- issue or replace barcode tokens
- deactivate old groups/tokens
- manage staff roles
- configure warning/escalation times
- review aggregate dismissal metrics

## Pickup groups, not just families

The scannable object is a `pickup_group`. Most pickup groups will represent one family, but the same model also supports carpools and other approved pickup arrangements without changing the student table.

A barcode contains only an opaque lookup token. It should not directly encode a student name, grade, homeroom, or internal student identifier.

## Duplicate behavior

A rescan must never create another simultaneous active dismissal for the same student. Instead it should surface the student's current state and record a rescan event.

Production should also define whether a student can be called a second time after being completed in the same daily dismissal session. The safer default is one completed pickup per student per session unless an authorized dispatcher explicitly reopens it.

## Timing

Initial visual defaults:

- under 5 minutes: normal
- 5–9:59: warning
- 10+ minutes: needs attention

These should become administrator-configurable settings rather than permanent hard-coded values.

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
- review the deployment and data handling with the school before launch
