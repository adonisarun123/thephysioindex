CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
CREATE SCHEMA "analytics";
--> statement-breakpoint
CREATE TYPE "public"."age_band" AS ENUM('minor', 'adult', 'senior');--> statement-breakpoint
CREATE TYPE "public"."alias_kind" AS ENUM('spelling', 'former_name', 'abbreviation', 'local_language', 'colloquial');--> statement-breakpoint
CREATE TYPE "public"."association_state" AS ENUM('pending', 'approved', 'rejected', 'ended');--> statement-breakpoint
CREATE TYPE "public"."authority_kind" AS ENUM('statutory_regulator', 'enrolment_body', 'degree_awarding', 'professional_association', 'other');--> statement-breakpoint
CREATE TYPE "public"."booking_mode" AS ENUM('instant', 'request');--> statement-breakpoint
CREATE TYPE "public"."booking_source" AS ENUM('platform', 'phone', 'walk_in', 'staff');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('confirmed', 'completed', 'patient_cancelled', 'provider_cancelled', 'no_show', 'requested', 'declined', 'expired');--> statement-breakpoint
CREATE TYPE "public"."branch_status" AS ENUM('draft', 'published', 'suspended', 'archived');--> statement-breakpoint
CREATE TYPE "public"."case_decision" AS ENUM('approved', 'rejected', 'changes_requested', 'suspended', 'reinstated', 'dismissed', 'merged');--> statement-breakpoint
CREATE TYPE "public"."case_state" AS ENUM('open', 'in_review', 'awaiting_evidence', 'decided', 'closed');--> statement-breakpoint
CREATE TYPE "public"."case_type" AS ENUM('listing_review', 'profile_change', 'claim', 'credential_check', 'duplicate_candidate', 'offer_review', 'review_moderation', 'complaint', 'correction_request', 'locality_proposal', 'credential_fraud', 'ownership_transfer', 'role_escalation');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('in_app', 'sms', 'email', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."claim_request_state" AS ENUM('requested', 'evidence_requested', 'under_review', 'approved', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."claim_state" AS ENUM('unclaimed', 'claimed');--> statement-breakpoint
CREATE TYPE "public"."clinic_status" AS ENUM('draft', 'published', 'suspended', 'archived');--> statement-breakpoint
CREATE TYPE "public"."consent_action" AS ENUM('granted', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."consent_purpose" AS ENUM('account_operation', 'profile_publication', 'dependant_booking', 'guardian_authority', 'marketing', 'provider_terms', 'patient_terms', 'privacy_notice', 'media_ownership', 'location_access');--> statement-breakpoint
CREATE TYPE "public"."consent_subject" AS ENUM('user', 'patient', 'practitioner', 'clinic');--> statement-breakpoint
CREATE TYPE "public"."credential_status" AS ENUM('self_declared', 'pending', 'document_reviewed', 'registration_checked', 'unverifiable', 'expired', 'suspended', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."credential_type" AS ENUM('statutory_registration', 'enrolment', 'degree', 'association_membership', 'certification');--> statement-breakpoint
CREATE TYPE "public"."delivery_state" AS ENUM('queued', 'sent', 'delivered', 'failed', 'dead', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."exception_kind" AS ENUM('leave', 'manual_block', 'date_override', 'extra_hours', 'external_busy');--> statement-breakpoint
CREATE TYPE "public"."export_state" AS ENUM('requested', 'running', 'ready', 'expired', 'failed');--> statement-breakpoint
CREATE TYPE "public"."gender_pref" AS ENUM('female', 'male', 'non_binary', 'unset');--> statement-breakpoint
CREATE TYPE "public"."geo_status" AS ENUM('active', 'inactive', 'merged', 'proposed');--> statement-breakpoint
CREATE TYPE "public"."geo_target_type" AS ENUM('state', 'district', 'city', 'locality');--> statement-breakpoint
CREATE TYPE "public"."guardian_verification_state" AS ENUM('self_declared', 'verified', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."idempotency_state" AS ENUM('in_progress', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."import_batch_state" AS ENUM('staged', 'validated', 'published', 'reverted', 'failed');--> statement-breakpoint
CREATE TYPE "public"."import_row_state" AS ENUM('pending', 'valid', 'invalid', 'duplicate', 'published', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."invitation_state" AS ENUM('pending', 'accepted', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('draft', 'submitted', 'changes_requested', 'published', 'rejected', 'suspended', 'archived');--> statement-breakpoint
CREATE TYPE "public"."media_purpose" AS ENUM('profile_photo', 'portfolio', 'clinic_photo', 'credential_evidence', 'identity_proof', 'claim_evidence', 'case_attachment', 'export');--> statement-breakpoint
CREATE TYPE "public"."moderation_state" AS ENUM('pending', 'approved', 'rejected', 'appealed');--> statement-breakpoint
CREATE TYPE "public"."offer_scope" AS ENUM('practitioner', 'clinic');--> statement-breakpoint
CREATE TYPE "public"."offer_state" AS ENUM('draft', 'submitted', 'approved', 'active', 'paused', 'expired', 'rejected', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."offer_type" AS ENUM('fixed', 'percentage');--> statement-breakpoint
CREATE TYPE "public"."outbox_state" AS ENUM('pending', 'claimed', 'delivered', 'failed', 'dead');--> statement-breakpoint
CREATE TYPE "public"."patient_status" AS ENUM('active', 'merged', 'closed');--> statement-breakpoint
CREATE TYPE "public"."payment_mode" AS ENUM('pay_at_clinic', 'online');--> statement-breakpoint
CREATE TYPE "public"."payment_reported_state" AS ENUM('not_reported', 'reported_received');--> statement-breakpoint
CREATE TYPE "public"."policy_type" AS ENUM('cancellation', 'provider_terms', 'patient_terms', 'privacy_notice', 'jurisdiction', 'ranking', 'offer_terms');--> statement-breakpoint
CREATE TYPE "public"."portfolio_kind" AS ENUM('award', 'certification', 'membership', 'publication', 'website', 'social');--> statement-breakpoint
CREATE TYPE "public"."practitioner_source" AS ENUM('self_created', 'imported', 'staff_created');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."privacy_request_state" AS ENUM('received', 'verified', 'in_progress', 'completed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."privacy_request_type" AS ENUM('access', 'correction', 'erasure', 'grievance');--> statement-breakpoint
CREATE TYPE "public"."profile_version_state" AS ENUM('draft', 'submitted', 'approved', 'rejected', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."proposal_state" AS ENUM('pending', 'approved', 'rejected', 'merged');--> statement-breakpoint
CREATE TYPE "public"."redemption_state" AS ENUM('reserved', 'consumed', 'released', 'restored');--> statement-breakpoint
CREATE TYPE "public"."reservation_state" AS ENUM('held', 'committed', 'released', 'expired');--> statement-breakpoint
CREATE TYPE "public"."review_state" AS ENUM('pending', 'published', 'rejected', 'appealed', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."role_name" AS ENUM('patient', 'practitioner', 'clinic_coordinator', 'clinic_manager', 'clinic_owner', 'verification_reviewer', 'support_agent', 'analyst', 'super_admin');--> statement-breakpoint
CREATE TYPE "public"."scan_state" AS ENUM('quarantined', 'clean', 'infected', 'failed');--> statement-breakpoint
CREATE TYPE "public"."scope_type" AS ENUM('global', 'practitioner', 'clinic', 'branch', 'case');--> statement-breakpoint
CREATE TYPE "public"."service_kind" AS ENUM('initial_assessment', 'follow_up', 'procedure', 'package', 'other');--> statement-breakpoint
CREATE TYPE "public"."service_mode" AS ENUM('clinic', 'home_visit', 'online');--> statement-breakpoint
CREATE TYPE "public"."state_kind" AS ENUM('state', 'union_territory');--> statement-breakpoint
CREATE TYPE "public"."support_state" AS ENUM('open', 'in_progress', 'waiting_on_requester', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."resolution_task_kind" AS ENUM('future_booking_after_suspension', 'association_ended', 'schedule_reduced', 'leave_conflict', 'cancellation_request_after_cutoff', 'credential_expired', 'account_closure', 'other');--> statement-breakpoint
CREATE TYPE "public"."resolution_task_state" AS ENUM('open', 'in_progress', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended', 'closed');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TABLE "guardian_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guardian_user_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"relationship" text NOT NULL,
	"verification_state" "guardian_verification_state" DEFAULT 'self_declared' NOT NULL,
	"consent_id" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_user_id" uuid,
	"display_name" text NOT NULL,
	"mobile" text,
	"mobile_verified_at" timestamp with time zone,
	"age_band" "age_band",
	"status" "patient_status" DEFAULT 'active' NOT NULL,
	"merged_into_patient_id" uuid,
	"created_by_user_id" uuid,
	"is_test_account" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "role_name" NOT NULL,
	"scope_type" "scope_type" DEFAULT 'global' NOT NULL,
	"scope_id" uuid,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"granted_by_user_id" uuid,
	"invitation_id" uuid,
	"reason" text,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invited_by_user_id" uuid NOT NULL,
	"invitee_mobile" text,
	"invitee_email" text,
	"role" "role_name" NOT NULL,
	"scope_type" "scope_type" NOT NULL,
	"scope_id" uuid,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"token_hash" text NOT NULL,
	"state" "invitation_state" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_by_user_id" uuid,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_subject" text NOT NULL,
	"mobile" text,
	"mobile_verified_at" timestamp with time zone,
	"email" text,
	"email_verified_at" timestamp with time zone,
	"display_name" text,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"is_test_account" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_id" uuid NOT NULL,
	"district_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" "geo_status" DEFAULT 'active' NOT NULL,
	"is_metro" boolean DEFAULT false NOT NULL,
	"tier" integer,
	"latitude" double precision,
	"longitude" double precision,
	"merged_into_city_id" uuid,
	"seo_intro" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "districts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" "geo_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "geo_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" "geo_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"alias_normalised" text NOT NULL,
	"kind" "alias_kind" DEFAULT 'spelling' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "geo_slug_redirects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" "geo_target_type" NOT NULL,
	"old_path" text NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "languages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"native_label" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "localities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" "geo_status" DEFAULT 'active' NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"pin_codes" text[],
	"merged_into_locality_id" uuid,
	"seo_intro" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locality_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city_id" uuid NOT NULL,
	"proposed_name" text NOT NULL,
	"proposed_pin_code" text,
	"proposed_by_user_id" uuid,
	"practitioner_id" uuid,
	"branch_id" uuid,
	"state" "proposal_state" DEFAULT 'pending' NOT NULL,
	"resolved_locality_id" uuid,
	"reviewer_user_id" uuid,
	"decision_reason" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "specialties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"parent_id" uuid,
	"requires_evidence" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"kind" "state_kind" DEFAULT 'state' NOT NULL,
	"status" "geo_status" DEFAULT 'active' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"claimant_user_id" uuid NOT NULL,
	"state" "claim_request_state" DEFAULT 'requested' NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"case_id" uuid,
	"reviewer_user_id" uuid,
	"decision_reason" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credential_authorities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"short_name" text,
	"kind" "authority_kind" NOT NULL,
	"jurisdiction_state_id" uuid,
	"official_url" text,
	"lookup_url" text,
	"policy_version" text DEFAULT '2026-10' NOT NULL,
	"accepted_for_booking" boolean DEFAULT false NOT NULL,
	"public_label" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"authority_id" uuid NOT NULL,
	"type" "credential_type" NOT NULL,
	"number_original" text,
	"number_normalised" text,
	"issue_date" date,
	"expires_on" date,
	"status" "credential_status" DEFAULT 'self_declared' NOT NULL,
	"source" text,
	"evidence_asset_id" uuid,
	"public_number_approved" boolean DEFAULT false NOT NULL,
	"scope_of_check" text,
	"last_checked_at" timestamp with time zone,
	"next_review_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "duplicate_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practitioner_a_id" uuid NOT NULL,
	"practitioner_b_id" uuid NOT NULL,
	"match_reasons" text[] NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"case_id" uuid,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"role" text NOT NULL,
	"organisation_name" text NOT NULL,
	"start_month" date NOT NULL,
	"end_month" date,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "experiences_dates_ordered" CHECK ("experiences"."end_month" IS NULL OR "experiences"."end_month" >= "experiences"."start_month")
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_name" text NOT NULL,
	"source_url" text,
	"collected_on" date NOT NULL,
	"permitted_use_basis" text NOT NULL,
	"state" "import_batch_state" DEFAULT 'staged' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"summary" jsonb,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"row_no" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"state" "import_row_state" DEFAULT 'pending' NOT NULL,
	"errors" jsonb,
	"practitioner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"kind" "portfolio_kind" NOT NULL,
	"title" text NOT NULL,
	"issuer" text,
	"item_date" date,
	"url" text,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practitioner_languages" (
	"practitioner_id" uuid NOT NULL,
	"language_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practitioner_slug_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practitioner_specialties" (
	"practitioner_id" uuid NOT NULL,
	"specialty_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"evidence_asset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practitioners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text NOT NULL,
	"slug" text NOT NULL,
	"owner_user_id" uuid,
	"claim_state" "claim_state" DEFAULT 'unclaimed' NOT NULL,
	"listing_status" "listing_status" DEFAULT 'draft' NOT NULL,
	"booking_eligible" boolean DEFAULT false NOT NULL,
	"booking_paused" boolean DEFAULT false NOT NULL,
	"published_version_id" uuid,
	"source" "practitioner_source" DEFAULT 'self_created' NOT NULL,
	"import_batch_id" uuid,
	"display_name" text NOT NULL,
	"designation" text,
	"headline" text,
	"gender" "gender_pref" DEFAULT 'unset' NOT NULL,
	"practice_start_date" date,
	"photo_asset_id" uuid,
	"search_vector" "tsvector",
	"review_count" integer DEFAULT 0 NOT NULL,
	"rating_avg_x100" integer,
	"suspended_at" timestamp with time zone,
	"suspension_reason" text,
	"published_at" timestamp with time zone,
	"is_test_account" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practitioners_name_len" CHECK (char_length("practitioners"."display_name") BETWEEN 2 AND 120),
	CONSTRAINT "practitioners_headline_len" CHECK ("practitioners"."headline" IS NULL OR char_length("practitioners"."headline") <= 160)
);
--> statement-breakpoint
CREATE TABLE "profile_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"state" "profile_version_state" DEFAULT 'draft' NOT NULL,
	"structured_content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"changed_fields" text[],
	"created_by_user_id" uuid,
	"submitted_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"decided_by_user_id" uuid,
	"decision_reason" text,
	"case_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qualifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"degree" text NOT NULL,
	"institution" text NOT NULL,
	"completion_year" smallint,
	"in_progress" boolean DEFAULT false NOT NULL,
	"evidence_asset_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qualifications_year_range" CHECK ("qualifications"."completion_year" IS NULL OR "qualifications"."completion_year" BETWEEN 1950 AND 2100)
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address_line1" text NOT NULL,
	"address_line2" text,
	"locality_id" uuid NOT NULL,
	"city_id" uuid NOT NULL,
	"state_id" uuid NOT NULL,
	"pin_code" char(6) NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"geocode_source" text,
	"working_hours" jsonb,
	"accessibility" jsonb,
	"facilities" text[],
	"directions" text,
	"public_phone" text,
	"status" "branch_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_pin_format" CHECK ("branches"."pin_code" ~ '^[1-9][0-9]{5}$'),
	CONSTRAINT "branches_lat_range" CHECK ("branches"."latitude" IS NULL OR "branches"."latitude" BETWEEN -90 AND 90),
	CONSTRAINT "branches_lng_range" CHECK ("branches"."longitude" IS NULL OR "branches"."longitude" BETWEEN -180 AND 180)
);
--> statement-breakpoint
CREATE TABLE "clinics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"owner_user_id" uuid,
	"public_phone" text,
	"public_email" text,
	"website" text,
	"about" text,
	"status" "clinic_status" DEFAULT 'draft' NOT NULL,
	"logo_asset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offering_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offering_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"duration_min" integer NOT NULL,
	"interval_min" integer NOT NULL,
	"buffer_before_min" integer DEFAULT 0 NOT NULL,
	"buffer_after_min" integer DEFAULT 0 NOT NULL,
	"base_price_paise" bigint NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"tax_paise" bigint DEFAULT 0 NOT NULL,
	"extra_charges_paise" bigint DEFAULT 0 NOT NULL,
	"price_note" text,
	"booking_horizon_days" integer DEFAULT 60 NOT NULL,
	"min_notice_min" integer DEFAULT 120 NOT NULL,
	"booking_mode" "booking_mode" DEFAULT 'instant' NOT NULL,
	"cancellation_policy_id" uuid,
	"active_from" date DEFAULT now() NOT NULL,
	"active_to" date,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offering_versions_duration_pos" CHECK ("offering_versions"."duration_min" > 0 AND "offering_versions"."duration_min" <= 480),
	CONSTRAINT "offering_versions_interval_pos" CHECK ("offering_versions"."interval_min" > 0 AND "offering_versions"."interval_min" <= 240),
	CONSTRAINT "offering_versions_buffers_nonneg" CHECK ("offering_versions"."buffer_before_min" >= 0 AND "offering_versions"."buffer_after_min" >= 0),
	CONSTRAINT "offering_versions_price_nonneg" CHECK ("offering_versions"."base_price_paise" >= 0 AND "offering_versions"."tax_paise" >= 0 AND "offering_versions"."extra_charges_paise" >= 0),
	CONSTRAINT "offering_versions_horizon" CHECK ("offering_versions"."booking_horizon_days" BETWEEN 1 AND 365),
	CONSTRAINT "offering_versions_notice" CHECK ("offering_versions"."min_notice_min" >= 0)
);
--> statement-breakpoint
CREATE TABLE "offerings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practitioner_branch_id" uuid NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"mode" "service_mode" DEFAULT 'clinic' NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT false NOT NULL,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practitioner_branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"active_from" date DEFAULT now() NOT NULL,
	"active_to" date,
	"state" "association_state" DEFAULT 'pending' NOT NULL,
	"bookable" boolean DEFAULT true NOT NULL,
	"public_contact_rules" jsonb,
	"approved_by_user_id" uuid,
	"ended_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practitioner_branches_dates" CHECK ("practitioner_branches"."active_to" IS NULL OR "practitioner_branches"."active_to" >= "practitioner_branches"."active_from")
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"slug" text NOT NULL,
	"kind" "service_kind" DEFAULT 'other' NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"offering_id" uuid,
	"weekday" smallint NOT NULL,
	"local_start" time NOT NULL,
	"local_end" time NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"effective_from" date DEFAULT now() NOT NULL,
	"effective_to" date,
	"schedule_version" bigint NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_rules_weekday" CHECK ("availability_rules"."weekday" BETWEEN 0 AND 6),
	CONSTRAINT "availability_rules_window" CHECK ("availability_rules"."local_end" > "availability_rules"."local_start"),
	CONSTRAINT "availability_rules_effective" CHECK ("availability_rules"."effective_to" IS NULL OR "availability_rules"."effective_to" >= "availability_rules"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "booking_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"actor_user_id" uuid,
	"actor_role" text,
	"from_state" text,
	"to_state" text,
	"reason" text,
	"correlation_id" text,
	"payload" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_notes_len" CHECK (char_length("booking_notes"."note") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "booking_price_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid,
	"reservation_id" uuid,
	"revision_no" integer DEFAULT 0 NOT NULL,
	"quote_version" integer DEFAULT 1 NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"base_paise" bigint NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"tax_paise" bigint DEFAULT 0 NOT NULL,
	"extra_paise" bigint DEFAULT 0 NOT NULL,
	"total_paise" bigint NOT NULL,
	"offer_version_id" uuid,
	"offer_explanation" text,
	"policy_version" text NOT NULL,
	"offering_version_id" uuid,
	"line_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_snapshot_nonneg" CHECK ("booking_price_snapshots"."base_paise" >= 0 AND "booking_price_snapshots"."discount_paise" >= 0 AND "booking_price_snapshots"."tax_paise" >= 0 AND "booking_price_snapshots"."extra_paise" >= 0 AND "booking_price_snapshots"."total_paise" >= 0),
	CONSTRAINT "price_snapshot_reconciles" CHECK ("booking_price_snapshots"."total_paise" = "booking_price_snapshots"."base_paise" - "booking_price_snapshots"."discount_paise" + "booking_price_snapshots"."tax_paise" + "booking_price_snapshots"."extra_paise")
);
--> statement-breakpoint
CREATE TABLE "booking_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"actor_user_id" uuid,
	"previous_snapshot" jsonb NOT NULL,
	"new_snapshot" jsonb NOT NULL,
	"reason" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"reservation_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"booked_by_user_id" uuid,
	"practitioner_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"offering_id" uuid NOT NULL,
	"offering_version_id" uuid NOT NULL,
	"status" "booking_status" DEFAULT 'confirmed' NOT NULL,
	"source" "booking_source" DEFAULT 'platform' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"appointment_reason" text,
	"payment_mode" "payment_mode" DEFAULT 'pay_at_clinic' NOT NULL,
	"payment_reported" "payment_reported_state" DEFAULT 'not_reported' NOT NULL,
	"payment_reported_at" timestamp with time zone,
	"price_snapshot_id" uuid,
	"policy_version" text NOT NULL,
	"notify_patient" boolean DEFAULT true NOT NULL,
	"confirmed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_user_id" uuid,
	"cancellation_reason" text,
	"no_show_recorded_at" timestamp with time zone,
	"correlation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_valid_time" CHECK ("bookings"."ends_at" > "bookings"."starts_at"),
	CONSTRAINT "bookings_reason_len" CHECK ("bookings"."appointment_reason" IS NULL OR char_length("bookings"."appointment_reason") <= 500),
	CONSTRAINT "bookings_version_pos" CHECK ("bookings"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "calendar_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"schedule_version" bigint DEFAULT 1 NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text NOT NULL,
	"route" text NOT NULL,
	"key_hash" text NOT NULL,
	"request_hash" text NOT NULL,
	"state" "idempotency_state" DEFAULT 'in_progress' NOT NULL,
	"status_code" integer,
	"response_body" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"patient_id" uuid,
	"offering_id" uuid NOT NULL,
	"offering_version_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"occupied_range" "tstzrange" NOT NULL,
	"state" "reservation_state" DEFAULT 'held' NOT NULL,
	"held_by_user_id" uuid,
	"hold_token_hash" text,
	"expires_at" timestamp with time zone,
	"schedule_version" bigint NOT NULL,
	"quote_version" integer DEFAULT 1 NOT NULL,
	"released_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservations_valid_time" CHECK ("reservations"."ends_at" > "reservations"."starts_at"),
	CONSTRAINT "reservations_valid_hold" CHECK ("reservations"."state" <> 'held' OR "reservations"."expires_at" IS NOT NULL),
	CONSTRAINT "reservations_range_bounded" CHECK (NOT isempty("reservations"."occupied_range") AND lower_inf("reservations"."occupied_range") = false AND upper_inf("reservations"."occupied_range") = false),
	CONSTRAINT "reservations_range_covers_appointment" CHECK ("reservations"."occupied_range" @> tstzrange("reservations"."starts_at", "reservations"."ends_at", '[)'))
);
--> statement-breakpoint
CREATE TABLE "resolution_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "resolution_task_kind" NOT NULL,
	"state" "resolution_task_state" DEFAULT 'open' NOT NULL,
	"booking_id" uuid,
	"practitioner_id" uuid,
	"branch_id" uuid,
	"assignee_user_id" uuid,
	"due_at" timestamp with time zone,
	"details" jsonb,
	"resolution" text,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"branch_id" uuid,
	"kind" "exception_kind" NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"local_date" date,
	"replacement_windows" jsonb,
	"internal_reason" text,
	"external_source" text,
	"schedule_version" bigint NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_exceptions_window" CHECK ("schedule_exceptions"."ends_at" > "schedule_exceptions"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "analytics"."daily_facts" (
	"day" text NOT NULL,
	"state_id" uuid,
	"city_id" uuid,
	"practitioner_id" uuid,
	"source" text,
	"metric" text NOT NULL,
	"value" bigint DEFAULT 0 NOT NULL,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics"."events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pseudonymous_id" text,
	"session_id" text,
	"practitioner_id" uuid,
	"city_id" uuid,
	"state_id" uuid,
	"source" text,
	"properties" jsonb
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_role" text,
	"action" text NOT NULL,
	"object_type" text NOT NULL,
	"object_id" uuid,
	"reason" text,
	"changed_fields" jsonb,
	"correlation_id" text,
	"ip_hash" text,
	"user_agent" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"event_type" text NOT NULL,
	"payload" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"previous_value" jsonb,
	"new_value" jsonb NOT NULL,
	"actor_user_id" uuid,
	"reason" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" "consent_subject" NOT NULL,
	"subject_id" uuid NOT NULL,
	"purpose" "consent_purpose" NOT NULL,
	"notice_version" text NOT NULL,
	"action" "consent_action" NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"proof_ref" text,
	"actor_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "export_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"scope" jsonb NOT NULL,
	"purpose" text NOT NULL,
	"state" "export_state" DEFAULT 'requested' NOT NULL,
	"asset_id" uuid,
	"row_count" integer,
	"expires_at" timestamp with time zone NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flag_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"enabled" boolean NOT NULL,
	"actor_user_id" uuid,
	"reason" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"description" text NOT NULL,
	"owner" text,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"object_key" text NOT NULL,
	"owner_user_id" uuid,
	"practitioner_id" uuid,
	"purpose" "media_purpose" NOT NULL,
	"visibility" "visibility" DEFAULT 'private' NOT NULL,
	"mime" text NOT NULL,
	"bytes" bigint NOT NULL,
	"checksum_sha256" text,
	"width" integer,
	"height" integer,
	"alt_text" text,
	"scan_state" "scan_state" DEFAULT 'quarantined' NOT NULL,
	"scanned_at" timestamp with time zone,
	"ownership_confirmed_at" timestamp with time zone,
	"moderation_state" "moderation_state" DEFAULT 'pending' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_bytes_pos" CHECK ("media_assets"."bytes" > 0),
	CONSTRAINT "media_assets_private_purposes" CHECK ("media_assets"."visibility" = 'private' OR "media_assets"."purpose" IN ('profile_photo', 'portfolio', 'clinic_photo'))
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"booking_id" uuid,
	"recipient_type" text NOT NULL,
	"recipient_id" uuid NOT NULL,
	"channel" "channel" NOT NULL,
	"template_id" uuid,
	"dedupe_key" text NOT NULL,
	"state" "delivery_state" DEFAULT 'queued' NOT NULL,
	"scheduled_for" timestamp with time zone DEFAULT now() NOT NULL,
	"aggregate_version" bigint,
	"provider_ref" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"transactional_sms" boolean DEFAULT true NOT NULL,
	"transactional_email" boolean DEFAULT true NOT NULL,
	"whatsapp_opt_in" boolean DEFAULT false NOT NULL,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"preferred_language" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"channel" "channel" NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"provider_template_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_counter_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_version_id" uuid NOT NULL,
	"redemption_id" uuid,
	"delta" smallint NOT NULL,
	"reason" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_version_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"booking_id" uuid,
	"state" "redemption_state" DEFAULT 'reserved' NOT NULL,
	"amount_paise" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"type" "offer_type" NOT NULL,
	"value" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"eligible_offering_ids" uuid[],
	"min_spend_paise" bigint DEFAULT 0 NOT NULL,
	"max_discount_paise" bigint,
	"total_cap" integer,
	"per_patient_cap" integer DEFAULT 1 NOT NULL,
	"first_visit_only" boolean DEFAULT false NOT NULL,
	"automatic" boolean DEFAULT true NOT NULL,
	"terms" text NOT NULL,
	"regular_price_confirmed" boolean DEFAULT false NOT NULL,
	"moderation_state" "moderation_state" DEFAULT 'pending' NOT NULL,
	"moderated_by_user_id" uuid,
	"moderation_reason" text,
	"moderated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offer_versions_validity" CHECK ("offer_versions"."ends_at" > "offer_versions"."starts_at"),
	CONSTRAINT "offer_versions_value" CHECK ("offer_versions"."value" > 0 AND ("offer_versions"."type" <> 'percentage' OR "offer_versions"."value" <= 10000)),
	CONSTRAINT "offer_versions_caps" CHECK (("offer_versions"."total_cap" IS NULL OR "offer_versions"."total_cap" > 0) AND "offer_versions"."per_patient_cap" > 0)
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_type" "offer_scope" NOT NULL,
	"practitioner_id" uuid,
	"clinic_id" uuid,
	"code" text,
	"title" text NOT NULL,
	"state" "offer_state" DEFAULT 'draft' NOT NULL,
	"current_version_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offers_scope_ref" CHECK (("offers"."scope_type" = 'practitioner' AND "offers"."practitioner_id" IS NOT NULL) OR ("offers"."scope_type" = 'clinic' AND "offers"."clinic_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"aggregate_version" bigint DEFAULT 1 NOT NULL,
	"event_type" text NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"correlation_id" text,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"state" "outbox_state" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"delivered_at" timestamp with time zone,
	"last_error" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text NOT NULL,
	"srs_ref" text,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "policy_type" NOT NULL,
	"key" text NOT NULL,
	"version" text NOT NULL,
	"title" text NOT NULL,
	"scope_type" text DEFAULT 'global' NOT NULL,
	"scope_id" uuid,
	"state_id" uuid,
	"content" jsonb NOT NULL,
	"body_markdown" text,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	"approved_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "privacy_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_user_id" uuid,
	"requester_contact" text,
	"request_type" "privacy_request_type" NOT NULL,
	"subject_type" text,
	"subject_id" uuid,
	"verified_at" timestamp with time zone,
	"due_at" timestamp with time zone NOT NULL,
	"state" "privacy_request_state" DEFAULT 'received' NOT NULL,
	"assignee_user_id" uuid,
	"details" text,
	"resolution" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_events" (
	"consumer" text NOT NULL,
	"event_id" uuid NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_events_consumer_event_id_pk" PRIMARY KEY("consumer","event_id")
);
--> statement-breakpoint
CREATE TABLE "record_access_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"object_type" text NOT NULL,
	"object_id" uuid NOT NULL,
	"purpose" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"text" text NOT NULL,
	"state" "moderation_state" DEFAULT 'pending' NOT NULL,
	"moderation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_replies_len" CHECK (char_length("review_replies"."text") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"text" text,
	"display_name" text NOT NULL,
	"state" "review_state" DEFAULT 'pending' NOT NULL,
	"moderation_reason" text,
	"moderated_by_user_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_rating_range" CHECK ("reviews"."rating" BETWEEN 1 AND 5),
	CONSTRAINT "reviews_text_len" CHECK ("reviews"."text" IS NULL OR char_length("reviews"."text") BETWEEN 20 AND 2000)
);
--> statement-breakpoint
CREATE TABLE "support_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"agent_user_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"authorised_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_case_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"event_type" text NOT NULL,
	"payload" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"requester_user_id" uuid,
	"requester_contact" text,
	"category" text NOT NULL,
	"linked_type" text,
	"linked_id" uuid,
	"priority" "priority" DEFAULT 'normal' NOT NULL,
	"state" "support_state" DEFAULT 'open' NOT NULL,
	"assignee_user_id" uuid,
	"description" text NOT NULL,
	"resolution" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_type" "case_type" NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"practitioner_id" uuid,
	"state" "case_state" DEFAULT 'open' NOT NULL,
	"priority" "priority" DEFAULT 'normal' NOT NULL,
	"assignee_user_id" uuid,
	"submitted_by_user_id" uuid,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_response_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"decided_by_user_id" uuid,
	"decision" "case_decision",
	"decision_reason" text,
	"method" text,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"checked_at" timestamp with time zone,
	"next_review_at" timestamp with time zone,
	"second_approver_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guardian_links" ADD CONSTRAINT "guardian_links_guardian_user_id_users_id_fk" FOREIGN KEY ("guardian_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_links" ADD CONSTRAINT "guardian_links_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_account_user_id_users_id_fk" FOREIGN KEY ("account_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_state_id_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "districts" ADD CONSTRAINT "districts_state_id_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "localities" ADD CONSTRAINT "localities_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locality_proposals" ADD CONSTRAINT "locality_proposals_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locality_proposals" ADD CONSTRAINT "locality_proposals_proposed_by_user_id_users_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locality_proposals" ADD CONSTRAINT "locality_proposals_resolved_locality_id_localities_id_fk" FOREIGN KEY ("resolved_locality_id") REFERENCES "public"."localities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locality_proposals" ADD CONSTRAINT "locality_proposals_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_requests" ADD CONSTRAINT "claim_requests_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_requests" ADD CONSTRAINT "claim_requests_claimant_user_id_users_id_fk" FOREIGN KEY ("claimant_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_requests" ADD CONSTRAINT "claim_requests_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_authorities" ADD CONSTRAINT "credential_authorities_jurisdiction_state_id_states_id_fk" FOREIGN KEY ("jurisdiction_state_id") REFERENCES "public"."states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_authority_id_credential_authorities_id_fk" FOREIGN KEY ("authority_id") REFERENCES "public"."credential_authorities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_candidates" ADD CONSTRAINT "duplicate_candidates_practitioner_a_id_practitioners_id_fk" FOREIGN KEY ("practitioner_a_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_candidates" ADD CONSTRAINT "duplicate_candidates_practitioner_b_id_practitioners_id_fk" FOREIGN KEY ("practitioner_b_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_items" ADD CONSTRAINT "portfolio_items_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practitioner_languages" ADD CONSTRAINT "practitioner_languages_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practitioner_languages" ADD CONSTRAINT "practitioner_languages_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practitioner_slug_history" ADD CONSTRAINT "practitioner_slug_history_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practitioner_specialties" ADD CONSTRAINT "practitioner_specialties_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practitioner_specialties" ADD CONSTRAINT "practitioner_specialties_specialty_id_specialties_id_fk" FOREIGN KEY ("specialty_id") REFERENCES "public"."specialties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practitioners" ADD CONSTRAINT "practitioners_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practitioners" ADD CONSTRAINT "practitioners_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_versions" ADD CONSTRAINT "profile_versions_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_versions" ADD CONSTRAINT "profile_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_versions" ADD CONSTRAINT "profile_versions_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_locality_id_localities_id_fk" FOREIGN KEY ("locality_id") REFERENCES "public"."localities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_state_id_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offering_versions" ADD CONSTRAINT "offering_versions_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."offerings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offering_versions" ADD CONSTRAINT "offering_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_practitioner_branch_id_practitioner_branches_id_fk" FOREIGN KEY ("practitioner_branch_id") REFERENCES "public"."practitioner_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practitioner_branches" ADD CONSTRAINT "practitioner_branches_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practitioner_branches" ADD CONSTRAINT "practitioner_branches_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practitioner_branches" ADD CONSTRAINT "practitioner_branches_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_resource_id_calendar_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."calendar_resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."offerings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_notes" ADD CONSTRAINT "booking_notes_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_notes" ADD CONSTRAINT "booking_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_price_snapshots" ADD CONSTRAINT "booking_price_snapshots_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_price_snapshots" ADD CONSTRAINT "booking_price_snapshots_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_price_snapshots" ADD CONSTRAINT "booking_price_snapshots_offering_version_id_offering_versions_id_fk" FOREIGN KEY ("offering_version_id") REFERENCES "public"."offering_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_revisions" ADD CONSTRAINT "booking_revisions_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_revisions" ADD CONSTRAINT "booking_revisions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_booked_by_user_id_users_id_fk" FOREIGN KEY ("booked_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."offerings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_offering_version_id_offering_versions_id_fk" FOREIGN KEY ("offering_version_id") REFERENCES "public"."offering_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cancelled_by_user_id_users_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_resources" ADD CONSTRAINT "calendar_resources_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_calendars" ADD CONSTRAINT "patient_calendars_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_resource_id_calendar_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."calendar_resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."offerings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_offering_version_id_offering_versions_id_fk" FOREIGN KEY ("offering_version_id") REFERENCES "public"."offering_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_held_by_user_id_users_id_fk" FOREIGN KEY ("held_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_tasks" ADD CONSTRAINT "resolution_tasks_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_tasks" ADD CONSTRAINT "resolution_tasks_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_tasks" ADD CONSTRAINT "resolution_tasks_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_tasks" ADD CONSTRAINT "resolution_tasks_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_tasks" ADD CONSTRAINT "resolution_tasks_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_resource_id_calendar_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."calendar_resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."events" ADD CONSTRAINT "events_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."events" ADD CONSTRAINT "events_state_id_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_case_id_verification_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."verification_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_history" ADD CONSTRAINT "config_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flag_events" ADD CONSTRAINT "feature_flag_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_template_id_notification_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."notification_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_counter_events" ADD CONSTRAINT "offer_counter_events_offer_version_id_offer_versions_id_fk" FOREIGN KEY ("offer_version_id") REFERENCES "public"."offer_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_counter_events" ADD CONSTRAINT "offer_counter_events_redemption_id_offer_redemptions_id_fk" FOREIGN KEY ("redemption_id") REFERENCES "public"."offer_redemptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_redemptions" ADD CONSTRAINT "offer_redemptions_offer_version_id_offer_versions_id_fk" FOREIGN KEY ("offer_version_id") REFERENCES "public"."offer_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_redemptions" ADD CONSTRAINT "offer_redemptions_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_redemptions" ADD CONSTRAINT "offer_redemptions_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_redemptions" ADD CONSTRAINT "offer_redemptions_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_redemptions" ADD CONSTRAINT "offer_redemptions_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_versions" ADD CONSTRAINT "offer_versions_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_versions" ADD CONSTRAINT "offer_versions_moderated_by_user_id_users_id_fk" FOREIGN KEY ("moderated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_config" ADD CONSTRAINT "platform_config_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_state_id_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_replies" ADD CONSTRAINT "review_replies_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_replies" ADD CONSTRAINT "review_replies_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_replies" ADD CONSTRAINT "review_replies_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_moderated_by_user_id_users_id_fk" FOREIGN KEY ("moderated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_case_id_support_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."support_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_agent_user_id_users_id_fk" FOREIGN KEY ("agent_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_case_events" ADD CONSTRAINT "support_case_events_case_id_support_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."support_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_case_events" ADD CONSTRAINT "support_case_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_cases" ADD CONSTRAINT "verification_cases_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_cases" ADD CONSTRAINT "verification_cases_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_cases" ADD CONSTRAINT "verification_cases_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_cases" ADD CONSTRAINT "verification_cases_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_cases" ADD CONSTRAINT "verification_cases_second_approver_user_id_users_id_fk" FOREIGN KEY ("second_approver_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guardian_links_active_uq" ON "guardian_links" USING btree ("guardian_user_id","patient_id") WHERE "guardian_links"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "guardian_links_patient_idx" ON "guardian_links" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "patients_account_user_idx" ON "patients" USING btree ("account_user_id");--> statement-breakpoint
CREATE INDEX "patients_mobile_idx" ON "patients" USING btree ("mobile");--> statement-breakpoint
CREATE INDEX "role_assignments_user_idx" ON "role_assignments" USING btree ("user_id","role");--> statement-breakpoint
CREATE INDEX "role_assignments_scope_idx" ON "role_assignments" USING btree ("scope_type","scope_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_assignments_active_uq" ON "role_assignments" USING btree ("user_id","role","scope_type",coalesce("scope_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "role_assignments"."revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_invitations_token_uq" ON "staff_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "users_auth_subject_uq" ON "users" USING btree ("auth_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "users_mobile_verified_uq" ON "users" USING btree ("mobile") WHERE "users"."mobile_verified_at" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_verified_uq" ON "users" USING btree (lower("email")) WHERE "users"."email_verified_at" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "cities_state_slug_uq" ON "cities" USING btree ("state_id","slug");--> statement-breakpoint
CREATE INDEX "cities_state_status_idx" ON "cities" USING btree ("state_id","status");--> statement-breakpoint
CREATE INDEX "cities_name_trgm_idx" ON "cities" USING gin (lower("name") gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "districts_state_slug_uq" ON "districts" USING btree ("state_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "geo_aliases_target_alias_uq" ON "geo_aliases" USING btree ("target_type","target_id","alias_normalised");--> statement-breakpoint
CREATE INDEX "geo_aliases_normalised_idx" ON "geo_aliases" USING btree ("alias_normalised");--> statement-breakpoint
CREATE UNIQUE INDEX "geo_slug_redirects_path_uq" ON "geo_slug_redirects" USING btree ("old_path");--> statement-breakpoint
CREATE UNIQUE INDEX "languages_code_uq" ON "languages" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "localities_city_slug_uq" ON "localities" USING btree ("city_id","slug");--> statement-breakpoint
CREATE INDEX "localities_city_status_idx" ON "localities" USING btree ("city_id","status");--> statement-breakpoint
CREATE INDEX "localities_name_trgm_idx" ON "localities" USING gin (lower("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "locality_proposals_state_idx" ON "locality_proposals" USING btree ("state","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "specialties_code_uq" ON "specialties" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "specialties_slug_uq" ON "specialties" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "states_code_uq" ON "states" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "states_slug_uq" ON "states" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "claim_requests_practitioner_idx" ON "claim_requests" USING btree ("practitioner_id","state");--> statement-breakpoint
CREATE INDEX "claim_requests_claimant_idx" ON "claim_requests" USING btree ("claimant_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credential_authorities_name_juris_uq" ON "credential_authorities" USING btree ("name",coalesce("jurisdiction_state_id", '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
CREATE INDEX "credentials_practitioner_idx" ON "credentials" USING btree ("practitioner_id");--> statement-breakpoint
CREATE INDEX "credentials_expiry_idx" ON "credentials" USING btree ("expires_on") WHERE "credentials"."expires_on" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "credentials_dup_idx" ON "credentials" USING btree ("authority_id","type","number_normalised");--> statement-breakpoint
CREATE UNIQUE INDEX "credentials_verified_number_uq" ON "credentials" USING btree ("authority_id","type","number_normalised") WHERE "credentials"."status" = 'registration_checked' AND "credentials"."number_normalised" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "duplicate_candidates_pair_uq" ON "duplicate_candidates" USING btree ("practitioner_a_id","practitioner_b_id");--> statement-breakpoint
CREATE INDEX "experiences_practitioner_idx" ON "experiences" USING btree ("practitioner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "import_rows_batch_row_uq" ON "import_rows" USING btree ("batch_id","row_no");--> statement-breakpoint
CREATE INDEX "import_rows_state_idx" ON "import_rows" USING btree ("batch_id","state");--> statement-breakpoint
CREATE INDEX "portfolio_items_practitioner_idx" ON "portfolio_items" USING btree ("practitioner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "practitioner_languages_uq" ON "practitioner_languages" USING btree ("practitioner_id","language_id");--> statement-breakpoint
CREATE INDEX "practitioner_languages_language_idx" ON "practitioner_languages" USING btree ("language_id");--> statement-breakpoint
CREATE INDEX "practitioner_slug_history_slug_idx" ON "practitioner_slug_history" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "practitioner_specialties_uq" ON "practitioner_specialties" USING btree ("practitioner_id","specialty_id");--> statement-breakpoint
CREATE UNIQUE INDEX "practitioner_specialties_primary_uq" ON "practitioner_specialties" USING btree ("practitioner_id") WHERE "practitioner_specialties"."is_primary";--> statement-breakpoint
CREATE INDEX "practitioner_specialties_specialty_idx" ON "practitioner_specialties" USING btree ("specialty_id");--> statement-breakpoint
CREATE UNIQUE INDEX "practitioners_public_id_uq" ON "practitioners" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "practitioners_slug_idx" ON "practitioners" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "practitioners_owner_idx" ON "practitioners" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "practitioners_listing_status_idx" ON "practitioners" USING btree ("listing_status");--> statement-breakpoint
CREATE INDEX "practitioners_name_trgm_idx" ON "practitioners" USING gin (lower("display_name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "practitioners_search_vector_idx" ON "practitioners" USING gin ("search_vector");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_versions_practitioner_version_uq" ON "profile_versions" USING btree ("practitioner_id","version");--> statement-breakpoint
CREATE INDEX "profile_versions_state_idx" ON "profile_versions" USING btree ("state","submitted_at");--> statement-breakpoint
CREATE INDEX "qualifications_practitioner_idx" ON "qualifications" USING btree ("practitioner_id");--> statement-breakpoint
CREATE INDEX "branches_clinic_idx" ON "branches" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "branches_locality_idx" ON "branches" USING btree ("locality_id","status");--> statement-breakpoint
CREATE INDEX "branches_city_idx" ON "branches" USING btree ("city_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "clinics_public_id_uq" ON "clinics" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "clinics_slug_idx" ON "clinics" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "clinics_name_trgm_idx" ON "clinics" USING gin (lower("name") gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "offering_versions_offering_version_uq" ON "offering_versions" USING btree ("offering_id","version");--> statement-breakpoint
CREATE INDEX "offerings_practitioner_idx" ON "offerings" USING btree ("practitioner_id","active");--> statement-breakpoint
CREATE INDEX "offerings_branch_idx" ON "offerings" USING btree ("branch_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "offerings_pb_service_mode_uq" ON "offerings" USING btree ("practitioner_branch_id","service_id","mode");--> statement-breakpoint
CREATE INDEX "practitioner_branches_practitioner_idx" ON "practitioner_branches" USING btree ("practitioner_id","state");--> statement-breakpoint
CREATE INDEX "practitioner_branches_branch_idx" ON "practitioner_branches" USING btree ("branch_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "practitioner_branches_active_uq" ON "practitioner_branches" USING btree ("practitioner_id","branch_id") WHERE "practitioner_branches"."state" IN ('pending', 'approved') AND "practitioner_branches"."active_to" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "services_code_uq" ON "services" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "services_slug_uq" ON "services" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "availability_rules_resource_idx" ON "availability_rules" USING btree ("resource_id","weekday");--> statement-breakpoint
CREATE INDEX "booking_events_booking_idx" ON "booking_events" USING btree ("booking_id","occurred_at");--> statement-breakpoint
CREATE INDEX "booking_notes_booking_idx" ON "booking_notes" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_price_snapshots_booking_idx" ON "booking_price_snapshots" USING btree ("booking_id","revision_no");--> statement-breakpoint
CREATE INDEX "booking_price_snapshots_reservation_idx" ON "booking_price_snapshots" USING btree ("reservation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_revisions_booking_rev_uq" ON "booking_revisions" USING btree ("booking_id","revision_no");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_reference_uq" ON "bookings" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_reservation_uq" ON "bookings" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "bookings_patient_start_idx" ON "bookings" USING btree ("patient_id","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_practitioner_status_start_idx" ON "bookings" USING btree ("practitioner_id","status","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_branch_start_idx" ON "bookings" USING btree ("branch_id","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_status_start_idx" ON "bookings" USING btree ("status","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_resources_practitioner_uq" ON "calendar_resources" USING btree ("practitioner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_actor_route_key_uq" ON "idempotency_records" USING btree ("actor_id","route","key_hash");--> statement-breakpoint
CREATE INDEX "idempotency_expiry_idx" ON "idempotency_records" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "patient_calendars_patient_uq" ON "patient_calendars" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "reservations_resource_state_idx" ON "reservations" USING btree ("resource_id","state","starts_at");--> statement-breakpoint
CREATE INDEX "reservations_patient_idx" ON "reservations" USING btree ("patient_id","starts_at");--> statement-breakpoint
CREATE INDEX "reservations_expiry_idx" ON "reservations" USING btree ("expires_at") WHERE "reservations"."state" = 'held';--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_hold_token_uq" ON "reservations" USING btree ("hold_token_hash") WHERE "reservations"."hold_token_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "resolution_tasks_state_idx" ON "resolution_tasks" USING btree ("state","due_at");--> statement-breakpoint
CREATE INDEX "resolution_tasks_practitioner_idx" ON "resolution_tasks" USING btree ("practitioner_id","state");--> statement-breakpoint
CREATE INDEX "schedule_exceptions_resource_time_idx" ON "schedule_exceptions" USING btree ("resource_id","starts_at","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_daily_facts_uq" ON "analytics"."daily_facts" USING btree ("day","metric",coalesce("state_id", '00000000-0000-0000-0000-000000000000'::uuid),coalesce("city_id", '00000000-0000-0000-0000-000000000000'::uuid),coalesce("practitioner_id", '00000000-0000-0000-0000-000000000000'::uuid),coalesce("source", ''));--> statement-breakpoint
CREATE INDEX "analytics_events_type_time_idx" ON "analytics"."events" USING btree ("event_type","occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_events_practitioner_idx" ON "analytics"."events" USING btree ("practitioner_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_object_idx" ON "audit_events" USING btree ("object_type","object_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "case_events_case_idx" ON "case_events" USING btree ("case_id","occurred_at");--> statement-breakpoint
CREATE INDEX "config_history_key_idx" ON "config_history" USING btree ("key","occurred_at");--> statement-breakpoint
CREATE INDEX "consent_records_subject_idx" ON "consent_records" USING btree ("subject_type","subject_id","purpose","captured_at");--> statement-breakpoint
CREATE INDEX "export_jobs_requester_idx" ON "export_jobs" USING btree ("requested_by_user_id","created_at");--> statement-breakpoint
CREATE INDEX "feature_flag_events_key_idx" ON "feature_flag_events" USING btree ("key","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_object_key_uq" ON "media_assets" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "media_assets_owner_idx" ON "media_assets" USING btree ("owner_user_id","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_dedupe_uq" ON "notification_deliveries" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "notification_deliveries_due_idx" ON "notification_deliveries" USING btree ("scheduled_for") WHERE "notification_deliveries"."state" IN ('queued', 'failed');--> statement-breakpoint
CREATE INDEX "notification_deliveries_booking_idx" ON "notification_deliveries" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_templates_uq" ON "notification_templates" USING btree ("event_type","channel","language","version");--> statement-breakpoint
CREATE INDEX "offer_counter_events_version_idx" ON "offer_counter_events" USING btree ("offer_version_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "offer_redemptions_reservation_uq" ON "offer_redemptions" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "offer_redemptions_offer_patient_idx" ON "offer_redemptions" USING btree ("offer_id","patient_id","state");--> statement-breakpoint
CREATE INDEX "offer_redemptions_version_state_idx" ON "offer_redemptions" USING btree ("offer_version_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "offer_versions_offer_version_uq" ON "offer_versions" USING btree ("offer_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_code_uq" ON "offers" USING btree (upper("code")) WHERE "offers"."code" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "offers_practitioner_idx" ON "offers" USING btree ("practitioner_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_event_id_uq" ON "outbox_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "outbox_events_pending_idx" ON "outbox_events" USING btree ("available_at") WHERE "outbox_events"."state" IN ('pending', 'failed');--> statement-breakpoint
CREATE INDEX "outbox_events_aggregate_idx" ON "outbox_events" USING btree ("aggregate_type","aggregate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "policies_type_key_version_uq" ON "policies" USING btree ("type","key","version");--> statement-breakpoint
CREATE INDEX "policies_effective_idx" ON "policies" USING btree ("type","key","effective_at");--> statement-breakpoint
CREATE INDEX "privacy_requests_state_idx" ON "privacy_requests" USING btree ("state","due_at");--> statement-breakpoint
CREATE INDEX "record_access_log_object_idx" ON "record_access_log" USING btree ("object_type","object_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "review_replies_review_version_uq" ON "review_replies" USING btree ("review_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_booking_uq" ON "reviews" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "reviews_practitioner_state_idx" ON "reviews" USING btree ("practitioner_id","state");--> statement-breakpoint
CREATE INDEX "support_access_grants_agent_idx" ON "support_access_grants" USING btree ("agent_user_id","expires_at");--> statement-breakpoint
CREATE INDEX "support_case_events_case_idx" ON "support_case_events" USING btree ("case_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "support_cases_reference_uq" ON "support_cases" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "support_cases_state_idx" ON "support_cases" USING btree ("state","priority","created_at");--> statement-breakpoint
CREATE INDEX "verification_cases_queue_idx" ON "verification_cases" USING btree ("case_type","state","submitted_at");--> statement-breakpoint
CREATE INDEX "verification_cases_subject_idx" ON "verification_cases" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "verification_cases_assignee_idx" ON "verification_cases" USING btree ("assignee_user_id","state");--> statement-breakpoint
CREATE INDEX "verification_cases_practitioner_idx" ON "verification_cases" USING btree ("practitioner_id");