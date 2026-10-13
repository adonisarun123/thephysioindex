## Software Requirements Specification

**India wide physiotherapist directory and appointment platform**

www.thephysioindex.com

**Prepared for Arun Mahendran**

Version 1.0 \| 13 October 2026 \| Product and engineering baseline

## Purpose

Build a national platform that helps patients discover physiotherapists
by state, city and locality, assess detailed professional profiles, and
book available appointments. Physiotherapists will maintain their
profiles, services, offers and calendars through a secure workspace.
Platform administrators will approve listings, manage verification and
monitor bookings and performance.

This specification defines the launch scope, system behaviour, data
model, integrations, operational requirements and acceptance tests. It
is intended for product owners, designers, developers, quality assurance
engineers and operations staff preparing estimates and implementation
plans.

## Core implementation decisions

• **Neon PostgreSQL is the system of record** for structured platform
data. Images and private documents use object storage with their
metadata and access rules recorded in Neon.

• **Launch with pay at clinic appointments.** Design payment interfaces
and price snapshots now; enable online collection, refunds and
settlements in a later release.

• **Separate professional identity from clinic locations.** One
physiotherapist can practise at several locations but has one conflict
controlled calendar.

• **Separate listing approval from credential verification.** A
published profile, a claimed profile and a registration checked profile
are different states.

• **Make launch requirements testable.** Requirement identifiers and
acceptance scenarios in this document form the implementation and
release checklist.

## Specification status

The user supplied requirements are the product baseline. Defaults such
as booking windows, moderation service levels and cancellation cutoffs
are proposed product policies, identified explicitly for owner review.
They are configuration values rather than hard coded restrictions. A
detailed release decision register appears in Section 30.

# 1 Reading and requirement conventions

## Document map

| **Sections** | **Coverage**                                                                                     |
|--------------|--------------------------------------------------------------------------------------------------|
| 2 to 4       | Scope, release boundaries, roles and public navigation                                           |
| 5 to 9       | Accounts, profile claims, credentials, professional profiles, clinics and geographic search      |
| 10 to 15     | Calendars, booking lifecycle, concurrency, patient management, offers and practitioner workspace |
| 16 to 17     | Administration, analytics, reviews, moderation and search visibility                             |
| 18 to 19     | Architecture, integrations and Neon deployment requirements                                      |
| 20 to 23     | Data dictionaries, relationships, database constraints and indexes                               |
| 24 to 25     | API endpoints, payloads, errors and event contracts                                              |
| 26 to 28     | Security, privacy, performance, accessibility, retention and operations                          |
| 29 to 31     | Acceptance tests, delivery roadmap, decisions and sources                                        |

## Requirement language

**Shall** denotes a mandatory requirement in its assigned release.
**Should** denotes a recommended implementation choice that may be
replaced by an equivalent documented design. A later release requirement
is mandatory only when that release is commissioned. Unlabelled
functional requirements are launch requirements.

Requirement families are DIR for directory, IAM for identity, VER for
verification, PRO for profiles, LOC for locations, CAL for calendars,
BKG for bookings, MSG for messages, OFR for offers, ADM for
administration, ANA for analytics, REV for reviews, SEO for
discoverability, DAT for data, API for interfaces, SEC for security and
NFR for quality.

## Terms

**Practitioner** means an individual physiotherapist. **Clinic** means a
care organisation; **branch** is a physical practice location.
**Offering** is a practitioner service at one branch or service mode.
**Reservation** is a capacity blocking interval; **booking** is a
patient appointment. **Credential** is a claimed qualification,
registration or membership with a type and issuer. **Verification**
records a specific check, its evidence, date and result.

**MVP** means the launch release. **R1** means subsequent growth
features. **R2** means online payments and related financial operations.
A **proposed default** must be confirmed before launch but does not
prevent design or development.

# 2 Scope and release boundaries

## Product outcomes

The platform shall reduce the steps from local discovery to a confirmed
appointment, make professional information comparable, and provide
physiotherapists with a reliable way to manage their public presence and
schedule. National geographic coverage is a capability; the product
shall not claim every physiotherapist is listed or verified.

| **Capability** | **Launch scope**                                                                                 | **Later release**                                                                                       |
|----------------|--------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| Discovery      | State, city, locality, specialty, fee and availability search; responsive profiles               | Multilingual content, saved searches and improved recommendations                                       |
| Profiles       | Claim or create, qualifications, work history, registration details, media, clinic links         | Articles, professional connections and richer portfolio features                                        |
| Scheduling     | Clinic visits, one to one slots, instant booking, manual bookings, cancellation and rescheduling | Home visits, practitioner acceptance mode, external calendar sync, waitlist and recurring care sessions |
| Commerce       | INR fees, moderated discounts, pay at clinic, booking price snapshot                             | R2 gateway collection, deposits, refunds, settlements and reconciliation                                |
| Operations     | Approval queues, verification, scoped staff access, analytics, support and audit                 | Advanced fraud detection and regional operations teams                                                  |
| Trust          | Credential labels, complaints, completed booking reviews and transparent offer terms             | Expanded automated verification when authorised APIs exist                                              |

## Included user requirements

**DIR-01** The platform shall support an India wide directory organised
by state or union territory, city and locality. **PRO-01** Each
practitioner shall have a detailed public professional profile.
**CAL-01** Approved practitioners shall publish available slots and
manage appointments. **ADM-01** A super administrator shall monitor
platform activity, approve listings and manage operations. **DAT-01**
Structured records shall persist in Neon PostgreSQL.

## Explicit exclusions at launch

The MVP does not provide clinical diagnosis, prescriptions, treatment
records, insurance claims, emergency dispatch, an employment
marketplace, a LinkedIn style social feed, native mobile apps, video
consultations, automated scraping of restricted directories, or online
payment collection. A calendar export is not a two way calendar sync. An
enquiry or telephone click is not a confirmed booking.

## Operating assumptions

The initial interface is English with translation ready labels and
Unicode content. Currency is INR, with integer paise in storage. The
default display timezone is Asia/Kolkata; timestamps are stored in UTC.
One practitioner can treat only one booked patient at a time. The
directory can launch nationally while onboarding and marketing proceed
city by city. Pricing for platform subscriptions or paid listings is
undecided; the MVP shall not charge a platform fee.

# 3 Roles and permissions

## Access model

**IAM-01** Every privileged operation shall be authorised on the server
using the authenticated user, role, organisation or practitioner scope,
record ownership and action. An interface hiding a button is
insufficient. A user may hold several roles, but shall explicitly switch
workspaces where needed.

| **Role**              | **Permitted access**                                                                      | **Restricted access**                                                                |
|-----------------------|-------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------|
| Visitor               | Search, read public profiles, see slots and offers                                        | No patient, document or appointment details                                          |
| Patient or guardian   | Own account, dependants, bookings, reviews and privacy requests                           | No other household or practitioner back office records                               |
| Physiotherapist       | Own profile, offerings, availability, bookings and aggregate performance                  | No other practitioner data or platform approval rights                               |
| Clinic coordinator    | Scheduling and limited patient contact for explicitly assigned practitioners and branches | No credential approvals, ownership changes, cross clinic data or unassigned bookings |
| Verification reviewer | Credential evidence, listing submissions and reasoned decisions                           | No broad patient directory, financial exports or role administration                 |
| Support agent         | Assigned cases and minimum booking details needed to resolve them                         | No bulk exports or unrestricted credential files                                     |
| Analyst               | Aggregated, deidentified operational reports                                              | No raw patient identities or credential documents                                    |
| Super administrator   | Platform configuration, approvals, roles, moderation and operational oversight            | Sensitive access still requires an audit trail and a stated purpose                  |

## Permission controls

**IAM-02** Staff invitations shall specify scope, expiry and permission
set. Accepting an invitation requires authentication with the invited
identity. Revocation shall terminate relevant sessions and take effect
on the next authorised request.

**IAM-03** Admin accounts shall use multifactor authentication. Adding
an administrator, changing a practitioner owner, exporting sensitive
data or performing a future refund above the configured limit shall
require recent reauthentication and a recorded reason. Ownership
transfers and privileged role escalation require approval by a second
authorised administrator; the requester cannot approve their own change.

**IAM-04** Staff shall not silently impersonate a patient. Support
assisted changes shall identify the actor and record patient or
practitioner authorisation. A temporary support grant shall be time
limited and scoped to a case.

**IAM-05** Security tests shall attempt access across two patients, two
practitioners, two clinics and each administrative role. All disallowed
reads, exports, signed document links and mutations shall fail without
leaking record existence or contents.

## Organisation ownership

A solo practitioner may operate without a clinic organisation account.
Creating a clinic association does not prove clinic ownership. Clinic
managers shall receive branch permissions only after a reviewed claim or
an invitation from an authorised owner.

# 4 Public experience and navigation

## Primary patient journey

Choose a location or allow optional geolocation, search for a
physiotherapist or service, compare profiles, select a clinic and
service, choose a slot, verify contact details, review the price and
cancellation policy, then confirm. The confirmation shall show an
appointment reference, local date and time, clinic directions and
management actions.

| **Route pattern**                           | **Purpose and required content**                                                 |
|---------------------------------------------|----------------------------------------------------------------------------------|
| /                                           | Search by place, name or specialty; browse states; practitioner onboarding entry |
| /physiotherapists                           | National discovery and location selection                                        |
| /physiotherapists/{state}                   | State or union territory directory with city navigation                          |
| /physiotherapists/{state}/{city}            | City results, localities and relevant services                                   |
| /physiotherapists/{state}/{city}/{locality} | Local results, map and list views                                                |
| /physiotherapist/{slug}-{public_id}         | Canonical professional profile and booking entry                                 |
| /clinics/{slug}-{public_id}                 | Clinic details, branches and associated practitioners                            |
| /book/{offering_id}                         | Slot selection and authenticated booking confirmation                            |
| /for-physiotherapists and /claim            | Registration benefits, create or claim flow                                      |
| /account, /workspace, /admin                | Patient, practitioner and platform workspaces                                    |
| /help and policy pages                      | Support, verification explanation, privacy, terms and cancellations              |

## Interface requirements

**DIR-02** The mobile profile shall present the practitioner's name,
professional designation, location, credential labels, fee basis and
next availability before long form content. A persistent booking action
shall remain keyboard accessible and shall not obscure page content.

**DIR-03** List cards shall show name, primary qualification, area of
practice, locality, clinic, service fee or clearly qualified starting
fee, verification label, review count and a booking action when
eligible. Unclaimed or unbookable profiles shall show an enquiry or
claim action without invented availability.

**DIR-04** Search and booking screens shall handle loading, empty
results, invalid location, expired session, offline state, unavailable
slot and service error. Failed submission shall preserve safe entered
data and show a specific retry action.

**DIR-05** The site shall provide breadcrumbs, filter counts, clear
filter reset, shareable URLs and back navigation that preserves search
state. Location permission shall be optional; manual entry must remain
usable.

**DIR-06** Profile links and QR codes shall resolve through stable
public identifiers. Renaming a practitioner or changing their locality
shall not break shared links. Content correction and report profile
links shall be visible.

# 5 Accounts and profile claims

## Patient identity

**IAM-06** Patients shall verify a mobile number before confirming a
booking. Email is optional at launch and shall be verified before it is
used for account recovery. A managed authentication service should
handle credentials, sessions and OTP delivery; authentication secrets
shall not be copied into profile tables.

**IAM-07** OTPs shall be single use, expire after a proposed five
minutes, and have resend throttling and a proposed five attempt limit.
Apply rate limits by account, destination, IP and risk signal without
relying on IP alone. Error messages shall not disclose whether a number
already has an account.

**IAM-08** Changing a login number shall require verification of the new
number and proof of existing account control or a reviewed recovery
case. Merge and recovery actions shall preserve booking ownership and be
auditable.

## Practitioner onboarding

**PRO-02** A practitioner shall search existing profiles before creating
one. The creation wizard shall capture identity and contact
verification, professional credentials, practice locations, services,
fees and profile publication consent. Drafts shall autosave and be
resumable.

**PRO-03** Submitting a listing shall validate mandatory fields, require
acceptance of current provider terms and create a review case. A draft,
submission or rejection shall not appear in public search. Approval
creates the first published profile version; booking enablement requires
the additional eligibility checks in Section 6.

## Claim workflow

**PRO-04** A claim shall move through requested, evidence requested,
under review, approved, rejected or withdrawn. The claimant must prove
control or professional identity using reviewer approved evidence. An
OTP sent to a newly entered number alone shall not transfer an existing
listing.

**PRO-05** A matching registration issuer and number shall raise a
duplicate warning. Similar name, phone, qualification and clinic matches
shall support a review queue rather than an automatic merge. Multiple
practitioners can share a clinic phone number.

**PRO-06** Two competing claims shall freeze ownership transfer until a
reviewer resolves the dispute. An already claimed listing shall not be
reassigned automatically. Approved claims shall bind the existing
practitioner identifier to the owner and retain the public URL,
historical source records and audit trail.

## Imported and unclaimed profiles

**PRO-07** Imports shall enter a private staging area with source URL,
collection date, permitted use basis and import batch. Only reviewed
professional business data may be published. Unclaimed profiles shall be
labelled and have no platform appointment slots. Provide correction and
removal requests; do not infer endorsement or publish private phone
numbers, certificates or home addresses.

# 6 Professional registration verification

## Credential model

**VER-01** Store credential type, issuing authority, jurisdiction,
original and normalised number, issue date, expiry where applicable,
evidence, source, status and last checked date. A practitioner can hold
multiple credentials. The platform shall not use one national number
format or require an NMC registration number for physiotherapists.

The official allied health enrolment FAQ distinguishes enrolment from
the further registration process. The system shall therefore distinguish
a statutory registration, enrolment identifier, degree and professional
association membership. None shall automatically substitute for another
\[S1\].

| **Credential or result**      | **Patient facing treatment**                                                       |
|-------------------------------|------------------------------------------------------------------------------------|
| Registration checked          | Show issuer, jurisdiction, approved public number, date checked and scope of check |
| Document reviewed             | Show that a document was reviewed; do not imply live registry confirmation         |
| Enrolment identifier          | Label as enrolment only; no automatic licence badge                                |
| Association membership        | Display in memberships; do not label it a licence                                  |
| Pending or unverifiable       | Clearly identify as pending or not independently verified                          |
| Expired, suspended or revoked | Remove active verification label and apply booking restrictions                    |

## Review and publication rules

**VER-02** A reviewer shall compare identity, qualification and issuer
evidence using an official lookup where available, or documented manual
verification. Record method, evidence reference, reviewer, time,
outcome, reason and next review date. The MVP shall not depend on an
undocumented government API or collect government portal login
credentials.

**VER-03** Maintain a configurable jurisdiction and authority policy
table identifying accepted credentials and booking requirements. Where a
current regulatory route is unavailable or uncertain, use a reviewed
exception with evidence and a precise public label; do not manufacture a
licence number or mark statutory registration verified. The launch
operations owner must validate each enabled jurisdiction's policy.

**VER-04** Listing publication and booking eligibility shall be separate
decisions. Booking requires a claimed account, verified contact,
approved profile, active offering, current booking eligibility and
published availability. Imported listings cannot become bookable through
a bulk import alone.

**VER-05** Changing identity, registration, degree or ownership shall
trigger renewed review. The previous approved version remains visible
unless a safety or fraud concern requires immediate suppression. Send
proposed renewal reminders 30, 7 and 1 day before a known expiry; remove
eligibility when the relevant credential expires.

**VER-06** Suspension shall prevent new reservations immediately,
identify all future bookings and create resolution tasks. Notify
affected patients with neutral wording; do not silently cancel
appointments without recording each outcome. Verification badges attest
to the stated check, not treatment quality or guaranteed outcomes.

# 7 Professional profile requirements

## Public field specification

**PRO-08** Profiles shall be structured professional portfolios with
separately editable sections, publication preview and completion status.
Required fields below are mandatory for a submitted, bookable profile
unless jurisdiction policy permits a documented exception.

| **Field group**    | **Required data**                                                           | **Validation and visibility**                                                                     |
|--------------------|-----------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------|
| Identity           | Name, designation, professional headline, photograph                        | Name 2 to 120 characters; headline up to 160; professional title reviewed                         |
| Summary            | About section and languages                                                 | Plain or sanitised rich text, 100 to 3000 characters; no scripts or outcome guarantees            |
| Qualifications     | Degree, institution, completion year                                        | At least one qualification; year not in the future for completed qualifications; evidence private |
| Registration       | Type, issuer, number or reviewed exception                                  | Number kept as text; status and source separate from self declaration                             |
| Experience         | Role, organisation, start and optional end month                            | Dates ordered; overlapping roles allowed; do not double count years                               |
| Expertise          | Primary and additional areas of practice                                    | Controlled taxonomy; claimed advanced credentials require supporting evidence                     |
| Practice           | At least one approved branch and active service                             | Address, locality, city, state, public contact, fee and appointment duration                      |
| Optional portfolio | Awards, certifications, memberships, publications, website and social links | Issuer and date where applicable; links validated; no patient identifiable media                  |
| Accessibility      | Clinic access, languages, facilities and optional practitioner gender       | No inferred identity attributes; clinic facilities maintained per branch                          |
| Patient trust      | Verification details, reviews, booking and correction links                 | System generated review counts; no editable self assigned ratings                                 |

## Presentation and versioning

**PRO-09** Display sections for overview, expertise, experience,
education, registrations, clinics, services, availability, reviews and
optional achievements. Hide empty optional sections. Use professional
LinkedIn like depth without a social feed or unsupported endorsements.

**PRO-10** Store drafts independently of the published version. Publish
only the approved field set and media. Escape or sanitise all public
content. Preserve version history with actor, changed fields and
moderation outcome.

**PRO-11** Display experience as self declared or calculate from an
approved practice start date with a clear rule. Do not sum concurrent
roles. Fees, registration validity and clinic associations shall show
current information; stale credentials shall not remain verified through
a cached page.

**PRO-12** Profile media shall require ownership or permission
confirmation, meaningful alternative text, safe file type validation and
moderation. Remove location metadata from public images. Certificates
and identity documents shall never be published as portfolio images.

# 8 Clinics and service offerings

## Clinic and branch structure

**LOC-01** A clinic shall have a name, optional legal organisation,
public contact and one or more branches. A branch shall have a complete
address, state, city, locality, PIN code, optional geocoordinates,
working hours, accessibility information and directions. PIN codes shall
be six digit strings; a PIN code is not a unique city or locality
identifier.

**LOC-02** Model a practitioner to branch association with start and end
dates, approval state, public contact rules and bookability. One
practitioner may work at many branches; one branch may host many
practitioners. Ending an association shall stop new bookings at that
branch and create a task for future appointments.

**LOC-03** Clinic ownership and practitioner affiliation shall be
reviewed separately. A clinic coordinator may edit only approved scope.
Public clinic hours shall not be treated as a practitioner's
availability.

## Offering configuration

**CAL-02** An offering shall link one practitioner, one service and one
branch for clinic mode. Required values are display name, mode,
duration, slot start interval, before and after buffers, fee in paise,
active dates, booking horizon, notice period, cancellation policy
version and booking mode. Store configuration changes as effective dated
versions.

**CAL-03** Proposed launch defaults are 30 minute duration, 15 minute
start interval, zero before buffer, 10 minute after buffer, two hour
minimum notice and a 60 day booking horizon. Providers may change values
within admin configured bounds. The platform shall validate duration,
buffers and start interval independently.

**OFR-01** Show whether a price applies to an initial assessment or
follow up, its duration, included service, taxes or extra charges and
any offer conditions. A starting fee on a profile shall link to the
offering that supports that amount. Do not publish an offer price for an
unavailable service.

## Future service modes

**LOC-04 R1** Home visits shall have a service area, address
confirmation, travel charge and buffers, with booking disabled outside
coverage. Exact patient addresses shall be visible only to assigned
staff after booking. Route planning is separate from locality search.

**CAL-04 R1** Online sessions shall use a distinct offering and approved
consultation workflow. Enabling an online mode shall not automatically
create a video service or satisfy professional practice requirements.

## Capacity policy

The launch unit of capacity is one physiotherapist. Rooms and equipment
are informational only. Group sessions, assistant substitution and
shared resource capacity require an additional resource allocation model
before release; raising a numeric capacity field shall not bypass
practitioner overlap protection.

# 9 Geography and search behaviour

## Geographic master data

**DIR-07** Maintain states and union territories, optional
administrative districts, cities and localities as controlled records
with stable IDs, status and aliases. Cities belong to a state;
localities belong to a city. Retain district mappings when available
without forcing the user to browse by district.

**DIR-08** Support aliases such as Bengaluru and Bangalore, spelling
variants and renamed locations. An alias resolves to one canonical
record or prompts disambiguation. New localities proposed during
onboarding shall enter a review queue instead of silently creating
duplicate SEO pages.

**DIR-09** Store branch coordinates separately from administrative
hierarchy. A near me query requires consent and shall disclose
approximate distance. Denying location access shall not block search. Do
not retain precise visitor location as an account attribute unless
specifically needed and consented.

## Search contract

**DIR-10** Search shall accept practitioner or clinic name, location,
specialty and service. Filters shall include state, city, locality,
radius when coordinates exist, specialty, language, clinic service mode,
fee range, availability date and verification category. Gender is an
optional self declared preference filter, with an unset state supported.

**DIR-11** Results shall include only publicly approved, non suspended
profiles. A search by locality shall include practitioners with an
active branch in that locality. Return one practitioner card, showing
the best matching branch and additional matching branches, rather than
duplicate cards for each clinic.

**DIR-12** Default ordering shall use match relevance, selected
location, bookable availability and a stable public identifier tie
break. Offer explicit next available, distance and fee sort options.
Document the ranking version. Discounts and advertising shall not
silently change organic relevance; future sponsored positions require a
visible label.

**DIR-13** Return 20 cards per page by default, capped at 50. Preserve
filters in the URL. Cursor based APIs shall use stable ordering. Search
results and directory page counts may be briefly cached; slot
confirmation must always revalidate availability.

## Edge cases and geography governance

**DIR-14** Empty results shall offer adjacent localities or broader city
filters and clearly identify the changed scope. The system shall not
invent practitioners or claim local coverage where no approved profiles
exist.

**DIR-15** Admin merge actions shall retain old slugs as redirects and
move relationships transactionally. Moving a branch to another locality
changes its discovery placement without creating a second practitioner
identity. Keep inactive geographic records for historical bookings and
exclude them from new selections.

# 10 Availability and calendar rules

## Schedule inputs

**CAL-05** Practitioners shall create weekly recurring windows per
branch and offering, effective date ranges, one time extra hours, leave,
holidays and manual blocks. All entry screens shall identify the
timezone. Future external busy periods shall be a distinct source, not
edits to the original schedule.

**CAL-06** Schedule precedence shall be: suspension or offering closure;
leave and manual blocks; existing reservations including buffers; date
specific overrides; recurring windows. An explicit date override
replaces recurring hours for that date. An empty override means closed,
not missing data.

**CAL-07** Availability shall be calculated from schedule rules and
exceptions, service duration, start interval, buffers, notice period,
booking horizon and active reservations across every branch. Start and
end instants must fall within the allowed service window, including
required buffers. Touching half open intervals may coexist when their
buffers do not overlap.

## Slot construction example

A service window of 09:00 to 12:00, a 30 minute appointment, a 15 minute
start interval and a 10 minute after buffer permits starts from 09:00
through 11:15. An 11:30 start is invalid because the occupied interval
ends at 12:10. A 10:00 booking blocks the same practitioner until 10:40,
including at another clinic.

**CAL-08** Display appointment time separately from the internal
occupied interval. Internal buffers shall affect availability but shall
not lengthen the patient facing appointment unless explicitly part of
the service. Minimum notice is measured from server time to appointment
start.

## Publishing and updating

**CAL-09** A schedule edit shall preview affected future bookings. It
shall not automatically move or cancel confirmed appointments. Reducing
availability preserves existing bookings as exceptions and creates
resolution tasks if a practitioner can no longer honour them. New
reservations must use the latest schedule version.

**CAL-10** Public calendars shall reveal only bookable slots, never
patient names, blocked event titles or appointment reasons. Provider
calendars shall support day, week and agenda views with accessible list
alternatives.

**CAL-11** Slot responses shall include the offering ID, UTC start and
end, display timezone, price reference and schedule version. Cached
availability is advisory. Show a friendly conflict message and refreshed
alternatives when another patient takes the slot.

**CAL-12 R1** External calendar sync shall initially import busy periods
only, with explicit OAuth consent, encrypted tokens, revocation and sync
health indicators. Because external systems can change concurrently,
disclose the limitation and require conflict review. No two way sync is
included in launch estimates.

# 11 Booking lifecycle and states

## Reservation and booking separation

**BKG-01** The system shall keep a short lived reservation separate from
a booking. A reservation may be held, committed or released; its expiry
uses database time. Only a committed booking is shown as confirmed.
Failed validation shall release the hold or allow it to expire safely.

| **Booking state**      | **Allowed next states**                                   | **Capacity and actor rule**                                               |
|------------------------|-----------------------------------------------------------|---------------------------------------------------------------------------|
| Confirmed              | Completed, patient cancelled, provider cancelled, no show | Occupies practitioner interval; changes by permitted actor                |
| Completed              | Corrected through audited admin workflow                  | Terminal; recorded after appointment end, never inferred solely from time |
| Patient cancelled      | None in normal flow                                       | Releases capacity; patient or authorised support records reason           |
| Provider cancelled     | None in normal flow                                       | Releases capacity; provider or admin records reason and notifies patient  |
| No show                | Corrected through audited admin workflow                  | May be recorded after a configurable grace period; proposed 15 minutes    |
| Requested R1           | Confirmed, declined, expired, patient cancelled           | Reserves capacity only until configured response deadline                 |
| Declined or expired R1 | None in normal flow                                       | Releases capacity; patient sees no confirmed appointment                  |

## Transition requirements

**BKG-02** Instant confirmation is the MVP booking mode. The system
shall create a confirmed appointment only after the slot, identity,
eligibility, offer and price validations succeed in one transaction.
Confirmation contains an immutable appointment reference.

**BKG-03** Rescheduling shall retain the booking ID and record old and
new time, branch, offering, price and policy versions in booking
revisions. It is an audited operation, not a terminal booking state. A
patient must accept a revised price before commitment. The old slot
remains valid if the replacement fails.

**BKG-04** Only allowed transitions shall execute. Updates shall use an
expected version to prevent a cancellation and completion overwriting
each other. Administrative corrections shall require a reason, preserve
the original event and trigger appropriate downstream corrections.

**BKG-05** Completing a booking shall not prove that an offline payment
was received. Financial status is separate. A cancelled or no show
appointment shall not permit a completed appointment review.

**BKG-06 R1** Request to book mode shall disclose the response deadline
before submission. Pending requests shall not hold capacity
indefinitely. Timeout, rejection and late acceptance must be
deterministic; an expired request cannot become confirmed without a new
availability check and patient consent.

## Patient conflicts

The launch service shall reject overlapping active appointments for the
same patient or dependant through a patient schedule lock. Different
dependants of the same guardian may attend different appointments at the
same time. Walk in records shall identify the patient sufficiently to
avoid obvious duplicates.

# 12 Booking transactions and race conditions

## Authoritative reservation flow

**BKG-07** Slot creation, confirmation, manual appointment entry,
rescheduling and relevant schedule edits shall acquire a database row
lock on the practitioner calendar. Patient calendar locks shall protect
patient overlaps. Transactions taking multiple locks shall use a stable
documented order to prevent deadlocks.

1\. Authenticate the actor and validate scope, patient or dependant
authority, offering and idempotency key. A login session cannot choose a
different patient account by changing an ID.

2\. Start a transaction and acquire the required practitioner and
patient calendar locks. Expire elapsed holds for these calendars before
checking availability. Recheck suspension, credential eligibility,
published offering and the current schedule version.

3\. Recompute the occupied interval, test all branch conflicts, minimum
notice and horizon, and validate offer eligibility. Create a proposed
five minute hold and reserve any limited offer entitlement. Commit and
return an opaque hold token scoped to the actor.

4\. On confirmation, lock the same records and hold, reject elapsed or
released holds, verify the expected price and policy version, and
revalidate eligibility. Convert the hold to a committed reservation,
create the booking and price snapshot, consume the offer entitlement and
append an outbox event in one transaction.

5\. Return the durable booking reference. Send messages asynchronously
from the outbox. A notification failure shall not undo a successfully
committed appointment.

## Concurrency guarantees

**BKG-08** A PostgreSQL exclusion constraint on the practitioner's
occupied time range shall be the final overlap guard. UI checks, cache
locks or a unique practitioner plus start time key are insufficient for
variable appointment lengths. Conflicts shall return a stable
SLOT_UNAVAILABLE error and fresh alternatives.

**BKG-09** Holds shall use an explicit blocking state. Do not use a time
dependent now() condition inside a partial index. An expiry worker shall
release elapsed holds at least every minute; every booking attempt also
performs expiry cleanup for the locked calendar, so a delayed worker
does not create indefinite blockage.

**BKG-10** An idempotency key shall be unique per actor and mutation
route, retained for at least 24 hours. Same key and same request returns
the original result; same key with a changed request returns a conflict.
Clients shall not blindly generate a new key after a timeout.

**BKG-11** Rescheduling shall release the old occupied interval and
insert the replacement inside the same transaction. Failure rolls
everything back. Offer counters, booking revisions, patient conflict
checks and outbox events participate in that transaction.

**BKG-12** No network call to SMS, email, mapping or payment providers
shall occur while calendar locks are held. Use bounded lock waits and
safe retries for deadlocks with the same idempotency key. Public display
caches never authorise a booking.

# 13 Patient management and messages

## Patient account and booking details

**BKG-13** A patient dashboard shall show upcoming and past
appointments, status, local time, practitioner, clinic address, service,
agreed fee, discount, policy and booking reference. Actions shall
include view directions, add to calendar, cancel, reschedule, rebook and
contact support according to eligibility.

**BKG-14** Collect the minimum required patient name, verified contact
and service choice. A short appointment reason is optional, limited to
500 characters and private. Do not request medical records or detailed
diagnosis in the MVP. Public analytics and message templates shall
exclude this free text.

**BKG-15** Proposed self service cancellation and rescheduling cutoff is
12 hours before the appointment. Before the cutoff, allow the action
directly. After it, allow a cancellation request to the clinic with a
clear status. Provider cancellation is always operationally possible
with a reason and notification. MVP cancellation does not generate a
platform monetary penalty.

**BKG-16** Dependants shall have a separate patient record linked to an
authorised guardian. Adults shall confirm authority to book on another
adult's behalf. Minor booking requires the configured guardian
verification and consent process; if this process is not implemented and
approved, disable minor bookings at launch. A checkbox alone shall not
be represented as verified parental consent.

## Notification matrix

| **Trigger**                | **Recipient and content**                                             | **Timing and channel**                                     |
|----------------------------|-----------------------------------------------------------------------|------------------------------------------------------------|
| Booking confirmed          | Patient and practitioner; reference, time, clinic and management link | Immediately queued; in app plus selected SMS or email      |
| Cancellation or reschedule | Both parties; revised status and next action                          | Immediately after commit                                   |
| Reminder                   | Patient; time, location and management link                           | Proposed 24 hours and 2 hours before; skip past windows    |
| Verification decision      | Practitioner; decision, reason and required action                    | After reviewer action                                      |
| Review invitation          | Patient; private link for completed appointment                       | Proposed 2 hours after recorded completion                 |
| Offer promotion            | Explicitly opted in audience only                                     | Separate campaign workflow; never treated as transactional |

## Delivery guarantees

**MSG-01** Templates shall be versioned by event, language and channel.
Delivery records shall include provider ID, state, attempts and last
error. Retry temporary failures with backoff; permanent failures go to
an operations queue. Proposed dispatch target is 95 percent within 60
seconds, excluding vendor delivery time.

**MSG-02** Deduplicate by event, recipient, channel and template
version. Before sending a reminder, recheck current booking time,
version and status. Cancel stale reminders after rescheduling.
Management links shall be short lived, opaque and require authentication
for changes.

**MSG-03** WhatsApp is optional and requires provider setup and channel
opt in. Transactional and promotional preferences shall be separate;
marketing unsubscribe shall not erase an appointment or block essential
service communication.

# 14 Pricing offers and future payments

## Price calculation

**OFR-02** Store money as nonnegative integer paise and currency as INR.
Compute service base price less eligible discount plus explicitly
disclosed taxes and additional charges. Never use floating point
arithmetic for money. Freeze line items, offer terms and policy version
on booking; later fee edits shall not change existing appointments.

**OFR-03** Offers shall support fixed amount or percentage reductions,
start and end timestamps, eligible offerings, a minimum spend, maximum
discount, total redemption cap, per patient cap and first completed
visit eligibility where specified. Percentage rounding shall use nearest
paise, with halves rounded up. The final service price shall not be
negative.

**OFR-04** Only one offer may apply at launch. First visit offers shall
have a one redemption per patient cap, including reserved entitlements.
The quote service selects the best eligible automatic offer or validates
the entered code, then explains the applied rule. The same result must
appear in search, profile, booking review and the stored quote, with
qualifiers where a price depends on eligibility.

**OFR-05** Limited redemptions shall be reserved on slot hold and
consumed on booking confirmation atomically. Released or expired holds
free the reservation. Proposed policy restores redemption entitlement
for cancelled bookings, but not for completed or no show bookings.
Record each counter change and protect caps against concurrent
confirmations.

**OFR-06** Offers shall pass moderation before publication. Providers
shall confirm the genuine regular price and terms. Prevent fabricated
strike through prices, hidden charges, guaranteed recovery claims and
publishing an expired offer. The admin can suspend an offer without
changing already accepted booking prices.

## Launch payment behaviour

**PAY-01** Bookings shall show pay at clinic and the agreed amount. No
card or UPI credentials shall be collected. A provider may mark an
appointment as payment reported received, but dashboards shall identify
this as self reported rather than platform collected revenue. Tax
classification and invoicing responsibility require a documented
business decision.

## Online payment release

**PAY-02 R2** Use a hosted gateway checkout with server created orders,
amount and currency validation, signed webhook verification and unique
provider event IDs. Browser redirects alone shall never mark a payment
successful.

**PAY-03 R2** Maintain payment attempts, refunds and settlements
independently of booking state. Model created, pending, succeeded and
failed payment attempts, with partial and full refunds tracked as
separate records. Do not store card numbers, CVV or UPI PINs.

**PAY-04 R2** Align checkout expiry with the slot hold. A late
successful payment after capacity release shall not force a booking into
an occupied slot; create a reconciliation exception and initiate the
configured refund or patient approved rebooking process.

**PAY-05 R2** Decide merchant of record, provider onboarding,
commission, invoice issuer, refund policy and settlement responsibility
before implementation. Use gateway supported marketplace settlement
facilities where applicable; the platform shall not improvise an
internal wallet or escrow service.

# 15 Physiotherapist workspace

## Workspace screens

| **Area**             | **Required controls and information**                                                       |
|----------------------|---------------------------------------------------------------------------------------------|
| Overview             | Today's appointments, upcoming bookings, pending actions, profile status and recent metrics |
| Profile editor       | Section based edits, media, credential upload, preview, submission and review feedback      |
| Clinics and services | Branch associations, offering duration, fees, active status and booking policies            |
| Calendar             | Day, week and agenda views; weekly schedule, leave, exceptions and manual blocks            |
| Appointments         | Search by reference, patient and date; filters; detail view; permitted transitions          |
| Offers               | Draft, submit, activate, pause and view redemption counts with terms                        |
| Team                 | Invitations, assigned branches or practitioners, permissions and revocation                 |
| Reports              | Views, confirmed bookings, completed visits, cancellations, sources and exports             |
| Settings             | Contact details, notification preferences, security, consent and account requests           |

## Operational requirements

**PRO-13** Manual bookings and walk ins shall use the same conflict
rules, patient validation and audit events as patient initiated
bookings. Store source as platform, phone, walk in or staff entry.
Manual entry shall not bypass suspension or overlap protection.

**PRO-14** Manual booking shall be available to a practitioner or
assigned coordinator. Staff shall confirm authority to enter the
patient's data and select whether a transactional confirmation is sent.
Patient contact verification is required before linking a staff created
record to an online account; do not auto merge solely by a shared phone
number.

**PRO-15** A calendar block shall capture start, end and internal
reason. Blocks may span several days but cannot silently displace
existing confirmed appointments. Bulk leave actions shall list affected
bookings and create follow up tasks.

**PRO-16** Appointment notes in the MVP are administrative only, such as
arrival assistance or callback request. The interface shall not label
them as a clinical record or invite treatment documentation. Store
access history and limit their visibility to assigned staff.

**PRO-17** CSV exports shall use the same scope rules as the screen,
require a purpose, expire after a short download window and be audited.
Mitigate spreadsheet formula injection in user supplied values. Exports
shall default to the minimum operational fields.

**PRO-18** A practitioner may pause new bookings without removing their
directory profile. Public copy shall indicate that online booking is
unavailable. Account closure shall first resolve future bookings and
transfer any authorised operational obligations; historical records
follow retention policy.

## Dashboard acceptance

A coordinator assigned to one branch shall not read another branch's
appointment list, even through a guessed API URL or export job. A
practitioner working at two clinics shall see one combined calendar and
branch filters. All numbers shall match the underlying scoped booking
records for the selected date definition.

# 16 Super admin and analytics

## Administrative controls

**ADM-02** Provide queues for new listings, profile changes, claims,
credential checks, duplicate candidates, offers, reviews, complaints and
correction requests. Each case shall have a status, assignee, priority,
submission time, evidence, decision reason and event history. Proposed
first response target is two business days; ageing and overdue queues
must be visible.

**ADM-03** Administrators shall approve, request changes, reject,
suspend, reinstate or archive a listing with a reason. Bulk actions
require a preview, affected count and per record outcome. Sensitive
decisions shall never overwrite their prior evidence or actor.

**ADM-04** A booking oversight screen shall filter by state, city,
practitioner, clinic, source, date type and status. Show masked patient
identifiers by default. Sensitive detail access requires the permission
and a purpose; aggregate monitoring does not require viewing medical
reasons.

**ADM-05** Geography, specialties, credential authorities,
configuration, message templates and policy versions shall be managed
through controlled master data screens. Changes shall be audited with
rollback or effective dating. Suspensions and booking closure take
effect immediately on the authoritative write path.

**ADM-06** Bulk onboarding shall support CSV validation, dry run,
duplicate review, row level errors and a reversible staging batch.
Require source and permission metadata. Never convert imported records
directly into verified or claimed profiles. Merge operations retain
aliases, sources and historical booking references.

## Metric definitions

| **Metric**          | **Definition and counting rule**                                                                                             |
|---------------------|------------------------------------------------------------------------------------------------------------------------------|
| Approved profiles   | Distinct active published practitioner IDs; separate claimed, verified and bookable totals                                   |
| Booking conversion  | Confirmed patient initiated bookings divided by tracked booking starts in the same defined cohort; disclose measurement gaps |
| Completed visits    | Bookings explicitly marked completed in the selected appointment date period                                                 |
| Cancellation rate   | Patient or provider cancelled bookings divided by confirmed cohort bookings, with actor breakdown                            |
| No show rate        | No show count divided by completed plus no show count for appointments whose time has elapsed                                |
| Booking value       | Sum of agreed amounts for the selected status and period; label as booking value, not revenue                                |
| Utilisation         | Booked service minutes divided by published available service minutes; exclude leave and report buffer policy                |
| Approval turnaround | Median and 90th percentile elapsed time from submission to first decision                                                    |

**ANA-01** Reports shall distinguish creation date, appointment date and
completion date, use Asia/Kolkata display boundaries, and exclude test
accounts. **ANA-02** Collect events such as search, profile view,
booking start, hold, confirmation and cancellation using pseudonymous
IDs. Never send patient names, contact details, health reasons or
credential documents to marketing analytics.

**ANA-03** Practitioner dashboards refresh within a proposed five
minutes and admin aggregates within 15 minutes. All reports show their
refresh time. CSV and on screen totals shall reconcile; small aggregate
cohorts may be suppressed to reduce reidentification.

# 17 Reviews content and search visibility

## Reviews and complaints

**REV-01** A patient may submit one rating and review per completed
booking. Verify eligibility through the booking relation, not an
uploaded prescription. Mark it as a platform appointment review; this
does not independently verify clinical outcomes. Do not accept purchased
ratings or review incentives tied to a positive score.

**REV-02** Ratings shall use whole numbers from one to five. Review text
shall have a proposed 20 to 2000 character limit. Public display uses a
chosen display name without full contact details. Warn against including
health records or another person's private data.

**REV-03** Reviews shall pass a moderation workflow for abuse, spam and
personal information. Negative feedback shall not be removed solely for
being negative. Show moderation reason to the submitter, provide appeal
and permit a provider reply without disclosing patient information.
Recalculate averages from published eligible reviews only.

**ADM-07** Support cases shall link to a listing, booking or review
where applicable, accept a category and evidence, track ownership and
resolution, and preserve an appeal path. Suspected credential fraud
shall have an urgent queue and a documented suspension decision.

## Search engine and answer engine requirements

**SEO-01** Render public directory and profile content on the server or
through an equivalent indexable output. Use descriptive titles, one main
heading, canonical URLs, breadcrumbs, sitemap segmentation and internal
links through geographic hierarchy. Avoid creating thin pages for every
possible filter combination.

**SEO-02** Index approved profiles and curated location pages with
useful unique content. Noindex account pages, booking steps, internal
search combinations, drafts, unclaimed pages that fail content policy
and empty location pages. Use authentication for privacy; noindex is not
an access control. Do not block crawling before a required noindex
directive can be processed.

**SEO-03** Use accurate JSON LD for Person and relevant clinic
organisations or locations, with BreadcrumbList and appropriate visible
review or offer data. Select schema types matching the entity; do not
mark a physiotherapist as a medical physician simply to obtain a rich
result. Validate against the actual schema vocabulary and current search
engine rules before release.

**SEO-04** Structured data shall match visible content. Search engines
decide whether to show rich results; schema does not guarantee enhanced
display \[S8\]. Include clear service explanations, accessible FAQs,
author details and dates for future educational content. AI generated
medical claims shall not be published without qualified editorial
review.

**SEO-05** Profile renames and geographic merges shall use permanent
redirects. Suspended or removed profiles require a reasoned 404, 410,
limited public page or noindex policy depending on the case. Purge stale
public caches promptly; never leak a private field through HTML metadata
or JSON LD.

# 18 System architecture

## Recommended implementation approach

Use a modular application with a responsive web frontend, server APIs
and separate background workers. A TypeScript stack with an SSR capable
frontend and a PostgreSQL compatible ORM is a suitable implementation
option; the SRS does not mandate a specific framework or cloud host.
Avoid introducing independently deployed microservices before
operational scale requires them.

| **Component**                           | **Responsibility and boundary**                                                                             |
|-----------------------------------------|-------------------------------------------------------------------------------------------------------------|
| Public web and authenticated workspaces | Accessible screens, rendering, user input and optimistic feedback; no privileged database secrets           |
| Application API                         | Authentication, authorisation, validation, booking transactions, profile publication and pricing            |
| Neon PostgreSQL                         | Authoritative identities, relationships, calendar reservations, bookings, configurations and audit metadata |
| Object storage and CDN                  | Public image derivatives and isolated private evidence objects with controlled access                       |
| Queue and scheduler                     | Outbox delivery, reminders, expiry, imports, image scanning, aggregates and exports                         |
| Cache and search projection             | Public directory acceleration and rate limits; replaceable, never authoritative for booking capacity        |
| External services                       | OTP, email or SMS, maps and geocoding; optional WhatsApp and later gateway or calendar providers            |

## Data movement and consistency

**DAT-02** Public read models shall contain only approved fields.
Publication emits a durable event that refreshes directory projections,
sitemaps and caches. Emergency suppression bypasses ordinary refresh
delay and is enforced at the API as well as the presentation layer.

**DAT-03** A committed business change and its outbox event shall be
written in the same Neon transaction. Workers claim events safely, retry
on temporary failure and record completion. Consumers must tolerate
repeated delivery. Do not promise exactly once delivery across external
providers.

**DAT-04** Use object storage keys rather than arbitrary client supplied
URLs for private evidence. Uploads shall be quarantined until type
checks and malware scanning succeed. A failed scan shall block review
and publication. Use separate public and private storage policies and
strip metadata from public image derivatives.

**API-01** Integrations shall sit behind provider adapters with
timeouts, retry rules and circuit breakers. Public directory browsing
should remain usable during a messaging outage. Booking shall fail
safely when the authoritative database is unavailable rather than
showing a false confirmation.

**API-02** Geocoding and map use require a chosen provider, licensed use
and cost controls. Manual address entry remains available when map
services fail. Do not make an unauthorised map scraping service a
production dependency.

## Trust boundaries

Browsers may submit data and receive scoped results; they shall not use
an owner database credential. Server identities shall be separated for
application writes, workers, analytics and migrations. The platform
database, storage objects, external tokens, logs and backups all belong
in the data access and deletion inventory.

# 19 Neon database deployment requirements

## Connections and environment isolation

**DAT-05** Use TLS and a least privilege application role. Use Neon's
pooled connection endpoint for normal web traffic and direct connections
for migrations and operations that require session features. Neon uses
transaction pooling, so session level state and session advisory locks
shall not be relied on for request isolation \[S4\].

**DAT-06** Separate production from development and staging, with
different credentials, storage and external service keys. Preview
environments shall use schema only branches or synthetic and
irreversibly anonymised data. A production database branch may contain
real patient data and is not automatically safe for testing \[S6\].

**DAT-07** Verify the selected PostgreSQL version, extensions, compute
region, limits and paid plan capabilities before provisioning. Select an
application region near the database. Record the actual region and all
subprocessors; do not claim India only hosting without verifying every
relevant service.

## Supported query design

**DAT-08** Use ordinary relational columns and foreign keys for core
entities. JSONB is appropriate for bounded snapshots and provider
payload metadata, not for hiding bookings, relationships or searchable
credentials inside one document. All primary entities shall have UUID
identifiers and timestamps.

**DAT-09** PostgreSQL full text search and pg_trgm should serve the
launch directory. PostGIS may support radius queries. Neon lists
pg_trgm, PostGIS and btree_gist extensions; confirm availability for the
provisioned version during setup \[S5\]. Add an external search engine
only after measuring a concrete performance or relevance limitation.

**DAT-10** Booking code shall use a driver path supporting the required
multi statement transaction and row locks on one transaction context.
Validate compatibility with the chosen ORM and serverless runtime. Do
not divide lock acquisition and booking writes across independent HTTP
database calls.

## Operations and recovery

**DAT-11** Use ordered, version controlled migrations, reviewed indexes
and rollback or forward repair procedures. The runtime role shall not
own the schema or run migrations. Test migrations against a realistic
synthetic dataset and ensure deploy order supports old and new
application versions during rollout.

**DAT-12** Configure recovery history and backups to meet the agreed RPO
and RTO. Plan features and restore windows vary; document the purchased
configuration. Keep protected logical exports if needed for independent
recovery, and test restores in isolation. Database branching is useful
operationally but is not the entire disaster recovery plan.

**DAT-13** Monitor query latency, compute saturation, pool wait, active
transactions, storage growth and restore readiness. Set budget alerts
and inspect expensive search and analytics queries. Scale to zero
behaviour must be measured against booking latency goals; disable it for
the production booking workload if necessary and supported.

# 20 Identity and directory data model

## Data dictionary conventions

**DAT-14** The following is a logical schema to be converted to reviewed
migrations. Each entity uses a UUID primary key, created_at and
updated_at as timestamptz, except append only events which use
occurred_at. Foreign keys use UUID unless stated. Fields are required
unless marked optional. Statuses are controlled values, not arbitrary
text. Public IDs are separate from private account identifiers.

| **Entity**                | **Principal fields**                                                                                 | **Relationships and constraints**                                                           |
|---------------------------|------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------|
| users                     | auth_subject text, mobile text optional, email text optional, status                                 | Unique auth subject; verified login identifiers unique; no plaintext credentials            |
| role_assignments          | user_id, role, scope_type, scope_id optional, expires_at optional                                    | Scope required outside global roles; approved invitation or grant                           |
| patients                  | account_user_id optional, display_name, age_band optional, status                                    | Patient identity distinct from login; supports staff entered and dependant records          |
| guardian_links            | guardian_user_id, patient_id, relationship, verification_state, consent_id                           | Explicit authority, scope and revocation; no inferred household access                      |
| practitioners             | owner_user_id optional, public_id text, slug text, listing_status, booking_eligible                  | Unique public ID; owner optional for unclaimed listing; one canonical professional identity |
| profile_versions          | practitioner_id, version int, structured_content jsonb, state, submitted_at optional                 | Unique practitioner and version; published_version pointer on practitioner                  |
| qualifications            | practitioner_id, degree, institution, completion_year, evidence_id optional                          | Structured public data; evidence points to private object                                   |
| experiences               | practitioner_id, role, organisation_name, start_month date, end_month optional                       | End not before start; overlapping roles permitted                                           |
| credentials               | practitioner_id, authority_id, type, number_original, number_normalised, expires_on optional, status | Duplicate check within authority, type and jurisdiction; evidence in separate records       |
| credential_authorities    | name, jurisdiction_id optional, kind, official_url optional, policy_version                          | Distinguish statutory regulator, enrolment body and association                             |
| verification_cases        | subject_type, subject_id, assignee_id optional, state, method, decision_reason optional              | Append decisions in case events; includes evidence, checked_at and next_review_at           |
| states and cities         | state code and name; city state_id, name, slug, district_id optional                                 | City slug unique within state; inactive records retained                                    |
| localities and aliases    | locality city_id, name, slug; alias target_id, kind, text                                            | Locality slug unique within city; aliases may require disambiguation                        |
| specialties and languages | stable code, label, active flag                                                                      | Join tables practitioner_specialties and practitioner_languages use unique pairs            |

## Cardinality and privacy

One user may own a practitioner profile and also have a patient account.
Ownership grants professional management rights, not access to unrelated
patient records. One practitioner has many versions, credentials,
experiences, specialties and branch associations. Public profile
projections expose only approved values; draft content and evidence
never come from an unrestricted row serialisation.

# 21 Scheduling and booking data model

| **Entity**              | **Principal fields**                                                                                                                                             | **Relationships and constraints**                                                                                                                               |
|-------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| clinics and branches    | Clinic name, owner organisation optional; branch clinic_id, locality_id, address, PIN, coordinates optional                                                      | Branch identity persists through name edits; coordinate range checks                                                                                            |
| practitioner_branches   | practitioner_id, branch_id, active_from, active_to optional, state                                                                                               | Unique active association; prevents scheduling at an unauthorised branch                                                                                        |
| services and offerings  | Service label; offering practitioner_branch_id, service_id, duration_min, interval_min, buffer_before_min, buffer_after_min, base_price_paise, policy_id, active | All durations positive except buffers which may be zero; Immutable offering_versions retain fees, duration and buffers; bookings reference the accepted version |
| calendar_resources      | practitioner_id unique, schedule_version bigint                                                                                                                  | Row locked for all capacity mutations; version increments on schedule edits                                                                                     |
| patient_calendars       | patient_id unique, version bigint                                                                                                                                | Locks prevent one patient being booked with two practitioners at overlapping times                                                                              |
| availability_rules      | resource_id, offering_id, weekday, local_start, local_end, timezone, effective dates                                                                             | Local time recurrence; end after start; break overnight windows into dated segments                                                                             |
| schedule_exceptions     | resource_id, branch_id optional, date or time range, kind, replacement_windows jsonb                                                                             | Leave, manual block or date override; internal reason private                                                                                                   |
| reservations            | resource_id, patient_id, offering_id, starts_at, ends_at, occupied_range tstzrange, state, expires_at optional                                                   | Held or committed intervals block capacity; holds require expiry; see Section 23                                                                                |
| bookings                | reference text, reservation_id, patient_id, booked_by_user_id, offering_id, status, source, version int, confirmed_at, price_snapshot_id                         | Unique reference and reservation; never hard delete a confirmed record during normal operation                                                                  |
| booking_revisions       | booking_id, revision_no, actor_id, previous_snapshot, new_snapshot, reason                                                                                       | Append only history of schedule, service and price changes                                                                                                      |
| booking_events          | booking_id, event_type, actor_id optional, from_state, to_state, reason optional                                                                                 | Append only event history; timestamps and correlation ID                                                                                                        |
| booking_price_snapshots | booking_id, revision_no, currency, base_paise, discount_paise, tax_paise, extra_paise, total_paise, offer_version optional, policy_version                       | Immutable for a revision; amounts reconcile; all displayed accepted terms retained                                                                              |
| idempotency_records     | actor_id, route, key_hash, request_hash, state, response_ref, expires_at                                                                                         | Unique actor, route and key; private response cache or durable result reference                                                                                 |

## Required booking invariants

**DAT-15** starts_at and ends_at use UTC timestamptz, and ends_at must
be greater than starts_at. occupied_range includes the applicable
buffers and uses inclusive start, exclusive end. Server code shall
derive it from the accepted offering version; the client cannot supply
an arbitrary shorter interval.

**DAT-16** A booking points to one active reservation; rescheduling
changes that link atomically and preserves the previous interval in
revisions. A committed reservation must correspond to a confirmed or
historically attended booking. Terminal cancellation releases the
blocking state. Booking creation and capacity commitment shall never be
split into unrelated transactions.

# 22 Operations and financial data model

| **Entity**                        | **Principal fields**                                                                                                | **Relationships and constraints**                                                   |
|-----------------------------------|---------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------|
| offers and offer_versions         | practitioner_id or clinic_id scope, code optional, type, value, validity range, caps, eligibility, moderation state | One approved version active; redemption logic uses immutable accepted version       |
| offer_redemptions                 | offer_version_id, patient_id, reservation_id, booking_id optional, state, amount_paise                              | Reserved, consumed, released; atomic cap enforcement; one applied offer per booking |
| reviews and replies               | booking_id, patient_id, practitioner_id, rating, text, moderation_state                                             | One review per completed booking; rating 1 to 5; replies versioned                  |
| claim_requests and import_batches | Subject, claimant or source, state, evidence and batch row outcomes                                                 | No automatic claim or verification from an import; duplicate mappings preserved     |
| media_assets                      | object_key, owner_id, purpose, MIME, bytes, checksum, scan_state, visibility                                        | Purpose controls public or private bucket policy; no binary files in database rows  |
| support_cases                     | requester_id, linked_subject, category, priority, state, assignee_id optional                                       | Case events append only; attachment access scoped to case                           |
| consent_records                   | subject_id, purpose, notice_version, action, captured_at, source, proof_ref optional                                | Append grants and withdrawals; do not overwrite consent history                     |
| privacy_requests                  | requester_id, request_type, verified_at optional, due_at, state, resolution                                         | Track correction, access, deletion and grievance workflows                          |
| audit_events                      | actor_id, action, object_type, object_id, reason, changed_fields, correlation_id                                    | Append only for app roles; redact secret and sensitive field values                 |
| outbox_events                     | event_id, aggregate_type, aggregate_id, version, event_type, payload, available_at, state, attempts                 | Unique event ID; claim with locking; replayable consumer contracts                  |
| notification_deliveries           | event_id, recipient_id, channel, template_version, state, provider_ref optional                                     | Unique deduplication key; attempts and last error without full sensitive content    |
| policies and configurations       | type, version, effective_at, approved_by, content, scope                                                            | Versioned provider and platform rules; no secrets in general configuration          |
| payment_orders and attempts R2    | booking_id or hold_id, provider, order_ref, amount_paise, currency, state, provider_payment_ref optional            | Provider references unique; several attempts allowed for one order                  |
| refunds and settlements R2        | payment_attempt_id, refund amount and state; settlement provider_ref, period, amounts                               | Sum of completed refunds cannot exceed captured amount; reconciliation required     |

## Growth and event data

**DAT-17** Analytics events shall use a separate restricted schema or
analytics service with pseudonymous identifiers. Aggregate facts include
date, geography, practitioner, source and state without patient details.
Large event tables may be partitioned by date after measured need;
booking referential integrity must survive any archival policy.

**DAT-18** Future payment_webhook_events shall store a provider event
ID, verification outcome and minimal payload reference. Unique provider
and event ID prevents duplicate financial mutations. Out of order events
must not regress a settled financial state.

# 23 Database integrity and index design

## Database enforced conflict protection

The following representative constraint is an implementation
requirement, not a complete migration. PostgreSQL supports exclusion
constraints for cross row restrictions \[S7\]. Enable btree_gist in the
selected Neon database before applying the equivalent schema.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE reservations ADD CONSTRAINT valid_time

CHECK (ends_at \> starts_at);

ALTER TABLE reservations ADD CONSTRAINT valid_hold

CHECK (state \<\> 'held' OR expires_at IS NOT NULL);

ALTER TABLE reservations ADD CONSTRAINT no_overlap

EXCLUDE USING gist (

resource_id WITH =,

occupied_range WITH &&

) WHERE (state IN ('held', 'committed'));

**DAT-19** Add NOT NULL to required fields and validate that
occupied_range is nonempty, bounded and equal to the server derived
buffered interval. Expired held records remain blocking until explicitly
transitioned; the transaction flow in Section 12 performs that cleanup.
Availability queries must apply the same state and expiry semantics.

## Key and relationship constraints

**DAT-20** Enforce foreign keys on patient, practitioner, branch,
offering, reservation and booking relations. Deleting a referenced
provider or branch shall be restricted or handled by an approved
anonymisation workflow, not by cascading destruction of historical
appointments. All cross tenant relationships shall be checked before
insertion.

**DAT-21** Authoritatively verified registration records shall be unique
within the issuing authority, jurisdiction and credential type for the
normalised number. Unverified competing submissions may coexist in a
review area; they shall not create two independently verified profiles.
Retain the original number for display and evidence comparison.

**DAT-22** A patient schedule lock and overlap query shall reject
overlapping active patient appointments, including holds. If using a
second exclusion constraint, use the appointment interval rather than
practitioner travel buffers and validate its effect on dependant
bookings.

## Query indexes and projections

Create B tree indexes on foreign keys and common filters: booking
patient plus start time, practitioner plus status and start time, branch
plus date, pending review state plus submitted time, and outbox state
plus available time. Use a unique booking reference and idempotency key
index.

Use a GIN index on an approved profile search vector and trigram indexes
on normalised names where measured. Use geographic indexes when radius
filtering is enabled. Partial indexes may cover active listings and
queues with stable predicates. Validate plans on the agreed load
dataset; avoid indexing every field without a query need.

# 24 API surface and contracts

## Common API rules

**API-03** Expose versioned JSON endpoints under /api/v1. Validate every
request with a shared schema, enforce role and record scope, use ISO
8601 timestamps with offsets, and return a request ID. Private responses
shall use no store caching. Public APIs shall project approved fields
only.

**API-04** Use cursor pagination with a maximum page size of 50. Return
stable machine error codes and safe user messages. Common responses are
400 invalid input, 401 unauthenticated, 403 unauthorised, 404
unavailable resource, 409 conflict, 422 business validation, 429 rate
limited and 503 dependency unavailable.

| **Endpoint family**             | **Main operations**                      | **Access and requirements**                               |
|---------------------------------|------------------------------------------|-----------------------------------------------------------|
| GET /locations and /specialties | Hierarchy, aliases and taxonomy lookup   | Public; cached approved data                              |
| GET /practitioners              | Search and filters                       | Public; unique practitioner results and stable pagination |
| GET /practitioners/{id}         | Published profile                        | Public; no drafts, evidence or private contact            |
| POST /practitioners and /claims | Draft creation or existing profile claim | Verified user; duplicate checks and consent               |
| PATCH /workspace/profile        | Save draft fields                        | Owner; expected version and field level validation        |
| POST /workspace/profile/submit  | Submit review version                    | Owner; complete required fields                           |
| GET /offerings/{id}/slots       | Slot display by date range               | Public; bounded 31 day query window                       |
| POST /booking-holds             | Reserve a selected slot and quote        | Authenticated patient; idempotency key required           |
| POST /bookings                  | Confirm owned active hold                | Patient or authorised staff; transactional commit         |
| GET /bookings/{id}              | Appointment detail                       | Owner or assigned operational scope                       |
| POST /bookings/{id}/cancel      | Cancel with actor and reason             | Policy and expected version required                      |
| POST /bookings/{id}/reschedule  | Atomic time or offering change           | Requote and user acceptance; idempotency required         |
| PUT /workspace/availability     | Publish schedule or exception            | Practitioner scope; preview impact and version check      |
| POST /workspace/offers          | Draft offer or submit approval           | Provider scope; cap and amount validation                 |
| POST /admin/cases/{id}/decision | Approve, reject or request change        | Reviewer or admin; reason and evidence reference          |
| GET /admin/analytics            | Aggregates and export job request        | Scoped permission; no patient data by default             |
| POST /webhooks/payments R2      | Provider payment event                   | Signature verification, replay defence and deduplication  |

**API-05** Generate an OpenAPI specification, example requests, role
requirements and error catalogue as development deliverables. Server
tests shall verify each operation against this contract. Avoid a generic
admin endpoint that can update arbitrary database fields.

# 25 Payloads and event contracts

## Booking request example

This example uses illustrative identifiers. The server owns all price,
practitioner scope and eligibility decisions; clients may supply
references and acknowledge a quote, but cannot authorise a discount by
posting an amount.

POST /api/v1/bookings

Idempotency-Key: client-generated-unique-key

{

"holdId": "opaque-owned-hold-id",

"patientId": "authorised-patient-id",

"expectedQuoteVersion": 3,

"acceptedPolicyVersion": "cancel-2026-01"

}

201 Created

{

"bookingId": "uuid",

"reference": "TPI-7K4M2Q",

"status": "confirmed",

"startsAt": "2026-11-02T04:30:00Z",

"timezone": "Asia/Kolkata",

"amountPaise": 80000,

"currency": "INR",

"paymentMode": "pay_at_clinic",

"version": 1

}

## Errors and updates

**API-06** Business error codes shall include SLOT_UNAVAILABLE,
HOLD_EXPIRED, OFFER_INELIGIBLE, OFFER_LIMIT_REACHED, PRICE_CHANGED,
PROFILE_NOT_BOOKABLE, POLICY_CUTOFF_PASSED and VERSION_CONFLICT. If a
quote changes, return a new quote for explicit acceptance; never
silently confirm at a higher fee.

**API-07** Mutations of existing bookings shall require expectedVersion.
A conflict response returns the permitted current representation for
reload. Tokens and raw exception messages shall not appear in error
bodies. A timed out confirmation must be recoverable using its
idempotency key.

## Domain events

**API-08** Event envelopes shall include eventId, eventType,
schemaVersion, occurredAt, aggregateId, aggregateVersion and
correlationId. Payloads contain the minimum fields needed by consumers.
Publish booking.confirmed, booking.rescheduled, booking.cancelled,
booking.completed, profile.published, profile.suspended,
verification.decided and offer.changed.

**API-09** Consumers shall record processed event IDs and reject or park
unsupported schema versions. A reminder consumer shall recheck the
aggregate version before delivery. Failed messages shall be replayable
from a dead letter queue with an audit entry. Email and SMS are
delivered at least once at the infrastructure level; application
deduplication reduces repeated messages.

**API-10 R2** Webhook processing shall verify the raw request signature,
enforce replay policy, persist the event before acknowledgement, and
reconcile asynchronous status against gateway records. Refund jobs shall
use their own idempotency keys and retain approval and failure history.

# 26 Security and privacy requirements

## Application security

**SEC-01** Use HTTPS, secure HTTP only session cookies where
appropriate, CSRF protection for cookie authenticated mutations, output
escaping, parameterised SQL and restrictive content security policy.
Validate redirects, file paths and outbound URL fetches. No user
supplied URL may become an unrestricted server side fetch.

**SEC-02** Require MFA for administrators and offer it to practitioners.
Proposed privileged idle timeout is 30 minutes, with reauthentication
for sensitive actions. Rotate secrets through a secret manager; never
place database, gateway or messaging keys in frontend bundles or logs.

**SEC-03** Apply deny by default server authorisation and row or policy
level database protections as defence in depth. Any database RLS context
must be set and consumed within the same transaction using a tested
pooling compatible pattern. The runtime role shall not bypass those
policies. Test tenant isolation rather than assuming UUIDs prevent
access.

**SEC-04** Validate MIME signatures, permitted extensions and size on
upload; proposed limits are 5 MB per public image and 10 MB per private
PDF or image. Reject active content. Quarantine and scan before use.
Private documents require short lived signed URLs, proposed five
minutes, issued only after a fresh access check.

**SEC-05** Rate limit login, search scraping, claims, holds, bookings
and exports. Bound outstanding holds per account and investigate
repeated abandonment. Detect anomalous administrative access. Audit
failed privileged actions without recording OTPs, authentication tokens
or full private payloads.

## Privacy by design

**SEC-06** Publish clear purpose specific notices. Record the relevant
notice version and consent where applicable. Separate account operation,
public profile publication, dependent booking and marketing choices.
Withdrawal shall be actionable and shall explain consequences for
outstanding bookings.

**SEC-07** Implement authenticated access, correction, erasure and
grievance requests with status, ownership and resolution history.
Account deletion must cover database records, search projections,
objects, exports and downstream systems subject to approved retention or
legal holds. A soft delete flag alone is not erasure.

**SEC-08** Restrict patient contact, appointment reasons, guardian
proofs and credential evidence by purpose and role. Do not collect
Aadhaar copies merely because an external enrolment portal uses Aadhaar.
Professional registration evidence and identity proof are separate
requirements.

## Regulatory implementation gate

The notified DPDP framework has phased commencement, with different
provisions taking effect immediately, after one year and after eighteen
months. The launch owner shall confirm which obligations apply on the
actual release date \[S2, S3\]. The requirements above are product
controls to build from the outset, not a claim that every provision is
already operative or that software alone establishes compliance.
Validate professional registration, promotional offers, consumer terms
and provider contracts with qualified Indian counsel before publication.

# 27 Quality and data retention targets

## Measurable nonfunctional requirements

These are proposed engineering acceptance targets, not observed
performance or guaranteed third party service levels. Validate them on
the agreed production sized configuration.

| **ID** | **Target**                                                                       | **Measurement and acceptance**                                                                                                 |
|--------|----------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------|
| NFR-01 | 99.9 percent monthly core availability                                           | Synthetic public search and booking checks; include planned maintenance in the reported measure                                |
| NFR-02 | Public page LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1                                    | 75th percentile mobile field data when available; use documented lab checks before traffic exists                              |
| NFR-03 | Search p95 ≤800 ms; slot query p95 ≤700 ms; booking commit p95 ≤1.5 s            | Server response under defined load, excluding OTP or vendor delivery; record cold and warm behaviour                           |
| NFR-04 | 100000 profiles, 20000 branches, 1000000 historical bookings                     | Synthetic sizing dataset, not a claim of existing market coverage                                                              |
| NFR-05 | 100 read requests per second plus 10 booking mutations per second for 30 minutes | Production like load; error rate below 1 percent excluding intentional business conflicts; zero overlapping confirmed bookings |
| NFR-06 | WCAG 2.2 AA target                                                               | Automated checks plus manual keyboard, focus, screen reader, error messaging and calendar tests \[S9\]                         |
| NFR-07 | Responsive at 360, 768, 1024 and 1440 CSS pixels                                 | No unintended horizontal scroll; latest two major browser versions and real mobile spot checks                                 |
| NFR-08 | RPO ≤15 minutes and RTO ≤4 hours                                                 | Demonstrated restore and recovery rehearsal; purchased hosting plan must support the design                                    |

## Proposed retention schedule

**SEC-09** Configure a documented retention basis, deletion job,
exception owner and legal hold process for each data class. The periods
below are proposed operational defaults, not statutory conclusions;
confirm them before release and extend only for a recorded requirement.

• OTP challenges expire after five minutes; retain only minimal abuse
metadata for 30 days. Purge unused registration drafts after 90 days
with prior notice where contact is available.

• Keep booking operational records for 24 months after the last
appointment, then anonymise or remove data no longer needed. Resolve
disputes and future financial record requirements through separate
retention classes.

• Retain credential evidence while the verified listing is active and
for a proposed 90 days after closure unless a dispute or applicable
requirement needs longer. Keep only necessary verification metadata
thereafter.

• Retain access and application logs for a proposed 180 days, security
audit evidence for 12 months and aggregate deidentified analytics for 24
months. Applicable incident and log requirements must be validated
before these defaults are approved.

• Expire generated exports after 24 hours. Set a proposed 30 day
encrypted backup cycle; reconcile this with the selected recovery plan.
After restore, reapply deletion tombstones before reopening access so
deleted data is not silently resurrected.

# 28 Delivery deployment and operations

## Engineering deliverables

**OPS-01** The development team shall supply source code, deployment
configuration, schema migrations, entity relationship documentation,
OpenAPI contracts, automated tests, design components, operational
runbooks and an administrator guide. All third party dependencies, paid
services and recurring cost drivers shall be listed.

**OPS-02** The delivery pipeline shall lint and build code, run core
unit and integration tests, validate migrations, scan dependencies and
deploy to staging before production. Include accessible form and
calendar tests and image or file access checks. Production credentials
shall not exist in preview environments.

**OPS-03** Use feature flags for payments, new jurisdictions with
unresolved eligibility policy, home visits, online consultations and
external calendar sync. Flags shall have owners and audit history. A
disabled feature must be rejected by the API as well as hidden in the
interface.

## Observability and incident handling

**OPS-04** Correlate API requests, database changes, outbox events and
provider messages through a request or correlation ID. Dashboards shall
monitor booking success, conflict rate, hold expiry lag, pending outbox
events, message failure, review queue ageing, API latency and database
health. Keep health reasons and personal data out of telemetry.

**OPS-05** Proposed alerts include API error rate above 2 percent for
five minutes, p95 booking latency over three seconds for ten minutes,
oldest transactional outbox item over five minutes, expiry lag over two
minutes and a failed backup or restore check. Assign an on call owner
and an escalation route.

**OPS-06** Incident runbooks shall cover database outage, credential
compromise, duplicate messages, import errors, stale search data,
practitioner suspension, failed deployment and future payment mismatch.
Security incidents require containment, evidence preservation, impact
assessment and notifications according to the applicable obligations; do
not hard code one deadline for every incident type.

## Release and recovery

**OPS-07** Use backwards compatible migrations and staged deployment.
Before release, back up or establish a tested restore point, verify
health checks and confirm a rollback procedure. Avoid a destructive
schema rollback that loses appointments committed after deployment; use
a forward repair when required.

**OPS-08** Restore the database and object references in an isolated
environment at least quarterly and before launch. Verify booking counts,
representative object retrieval, consent and deletion handling, then
record achieved RPO and RTO. A successful backup job alone is not proof
of recovery.

**OPS-09** Run scheduled jobs with singleton or safely distributed
locking, bounded batches and restartable checkpoints. Imports, reminder
dispatch and exports must tolerate worker crashes without duplicate
irreversible effects.

## Operational readiness

Assign an owner for verification, support, privacy, security incidents
and platform analytics before inviting public bookings. Train reviewers
on credential labels and escalation decisions. Seed geography and
specialties from a reviewed source, reconcile duplicate records and
activate only the jurisdiction policies that operations can support.

# 29 Acceptance and traceability

## Core release scenarios

The following tests are the minimum business acceptance suite. Execute
them through public and authenticated APIs where relevant, not only by
clicking the interface. Each failed launch scenario blocks release until
resolved or explicitly removed from scope.

| **Test**                          | **Requirements**     | **Expected result**                                                                                                                                            |
|-----------------------------------|----------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| AT-01 Geographic discovery        | DIR-01, 07 to 15     | State, city, locality and aliases resolve correctly; one practitioner card appears for multiple matching branches                                              |
| AT-02 Public profile integrity    | PRO-08 to 12, SEO-05 | Published page and metadata contain approved data only; private evidence and drafts cannot be retrieved                                                        |
| AT-03 Claim and duplicate control | PRO-04 to 07, VER-01 | Competing claims reach review; enrolment or membership is never displayed as statutory licence verification                                                    |
| AT-04 Cross account isolation     | IAM-01 to 05, SEC-03 | Second patient, practitioner and clinic cannot read or mutate each other's records, files or exports                                                           |
| AT-05 Slot calculation            | CAL-05 to 11         | Leave, buffers, cutoffs, date overrides and branch changes produce exactly the expected slot set                                                               |
| AT-06 Concurrent reservations     | BKG-07 to 09, DAT-19 | 50 valid simultaneous attempts at one available overlapping interval across two branches yield exactly one confirmed appointment; all others receive conflicts |
| AT-07 Retry after timeout         | BKG-10, API-07       | Repeated identical key returns original booking; altered payload with same key returns conflict                                                                |
| AT-08 Expired hold                | BKG-09               | Elapsed hold cannot confirm; delayed expiry worker does not indefinitely block a new attempt                                                                   |
| AT-09 Atomic reschedule           | BKG-03, 11           | Occupied new slot causes full rollback; original time, quote and offer remain intact                                                                           |
| AT-10 Lifecycle conflicts         | BKG-04, 05           | Concurrent completion and cancellation cannot overwrite each other; offline receipt is not inferred                                                            |
| AT-11 Offer race and price        | OFR-02 to 06         | Last redemption cannot be consumed twice; rounding and snapshots match displayed terms                                                                         |
| AT-12 Suspension and expiry       | VER-04 to 06         | New reservations stop immediately; future appointments enter an auditable resolution queue                                                                     |
| AT-13 Notification failure        | MSG-01 to 03, DAT-03 | Booking remains confirmed; messages retry without duplicate logical notifications or stale reminders                                                           |
| AT-14 Dependants                  | BKG-16               | Unauthorised dependant access fails; two dependants can book concurrently; minor flow is gated                                                                 |
| AT-15 Privacy and uploads         | SEC-04, 07 to 09     | Unsafe file stays quarantined; signed access expires; erasure covers projections and restore tombstones                                                        |
| AT-16 Reporting and reviews       | ANA-01 to 03, REV-01 | Status and date filters reconcile; review possible only for the correct completed booking                                                                      |
| AT-17 Quality and recovery        | NFR-01 to 08, OPS-08 | Agreed load, accessibility and restore tests meet thresholds with evidence recorded                                                                            |
| AT-18 Future payments R2          | PAY-02 to 05, API-10 | Duplicate or reordered webhooks, partial refunds and late success cannot double charge or overbook                                                             |

**Exit criteria** All launch scenarios pass; no unresolved critical or
high severity security defects; monitoring and restoration tested;
published policies and jurisdiction rules approved; core journeys pass
on mobile and desktop; reviewer and support owners trained.

# 30 Roadmap and decision register

## Delivery sequence

**Foundation** Finalise terminology, wireframes, role scopes and
jurisdiction policies; provision isolated Neon environments; implement
authentication, geography, credentials and profile versioning. Exit with
a reviewable directory and controlled onboarding.

**Launch build** Add offerings, availability, transactional booking,
cancellations, rescheduling, pay at clinic offers, staff workspaces,
notifications, completed appointment reviews, admin queues and
analytics. Exit with the Section 29 suite passing and an operations
rehearsal completed.

**R1 growth** Add selected languages, external calendar busy sync,
request to book, waitlists, home visits or online modes, recurring
session management and richer professional publishing. Each feature
requires its own conflict and privacy acceptance tests.

**R2 payments** Confirm the commercial and legal model, implement
gateway orders, signed webhooks, refunds, reconciliation, invoicing and
settlements, then run end to end sandbox and production readiness tests
before enabling collection.

## Owner decisions with proposed defaults

| **Decision**            | **Proposed baseline**                                                     | **Decision owner and timing**                          |
|-------------------------|---------------------------------------------------------------------------|--------------------------------------------------------|
| Platform business model | No listing fee or commission in MVP; pay at clinic                        | Arun or product owner before commercial terms          |
| Booking mode            | Instant confirmation; one practitioner per slot                           | Product and operations before calendar build           |
| Cancellation rule       | 12 hour self service cutoff; no platform penalty in MVP                   | Product and operations before booking UAT              |
| National rollout        | National taxonomy; activate bookability by reviewed jurisdiction policy   | Operations and legal before enabling each jurisdiction |
| Imported profiles       | Reviewed public business data; unclaimed and not bookable                 | Product and legal before first import                  |
| Minors and dependants   | Enable only after guardian verification is implemented                    | Product, privacy and legal before launch               |
| Service modes           | Clinic only at launch                                                     | Product before estimation                              |
| Notifications           | In app plus chosen SMS or email vendor; WhatsApp optional                 | Engineering and operations before integration          |
| Hosting and data region | Choose supported Neon and application regions after vendor assessment     | Engineering and privacy before provisioning            |
| Reviews and offers      | Moderated; completed booking reviews; nonstacking offers                  | Operations before content policy signoff               |
| Payments and taxes      | Deferred; choose collection, invoicing, tax and settlement responsibility | Product, finance and legal before R2                   |

## Change control

Treat a change to booking capacity, payment responsibility, sensitive
data collection or credential eligibility as an SRS change, with
version, rationale, affected requirements, migrations and tests.
Estimate delivery dates after the team, wireframes, vendors and decision
register are confirmed. National data acquisition and manual
verification effort must be estimated separately from software
development.

# 31 Source register and implementation notes

## Primary sources

Sources were checked on 13 October 2026. They support the specific
technical or regulatory observations cited in this SRS. Product defaults
and performance targets are proposed requirements, not claims taken from
these sources. Recheck current guidance at implementation and release.

**S1 NCAHP Allied health professional enrolment FAQ**

<https://ahpr.abdm.gov.in/faq>

**S2 MeitY Digital Personal Data Protection Rules 2025**

<https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf>

**S3 MeitY DPDP Act commencement notification**

<https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf>

**S4 Neon documentation on connection pooling**

<https://neon.com/docs/connect/connection-pooling>

**S5 Neon documentation on PostgreSQL extensions**

<https://neon.com/docs/extensions/pg-extensions>

**S6 Neon documentation on branching**

<https://neon.com/docs/introduction/branching>

**S7 PostgreSQL documentation on constraints**

<https://www.postgresql.org/docs/current/ddl-constraints.html>

**S8 Google Search Central documentation**

<https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data>

**S9 W3C Web Content Accessibility Guidelines 2.2**

<https://www.w3.org/TR/WCAG22/>
