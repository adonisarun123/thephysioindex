-- MSG-01 fix: users created by an email or SMS OTP sign-up were mirrored into
-- public.users without their verified flags (the create hook did not copy
-- them and no update followed), so dispatch saw no verified contact and
-- cancelled their notifications. Copy the flags from the auth store once.
-- One account per address (oldest first) and never an address another
-- account already holds verified, so the partial unique indexes cannot fail.
UPDATE public.users u SET email_verified_at = coalesce(a.updated_at, a.created_at, now())
FROM auth."user" a,
     (SELECT DISTINCT ON (lower(x.email)) x.id FROM public.users x JOIN auth."user" y ON y.id::text = x.auth_subject
      WHERE y.email_verified AND x.email IS NOT NULL AND x.email_verified_at IS NULL AND lower(x.email) = lower(y.email)
      ORDER BY lower(x.email), x.created_at) pick
WHERE u.id = pick.id AND a.id::text = u.auth_subject
  AND NOT EXISTS (SELECT 1 FROM public.users o WHERE lower(o.email) = lower(u.email) AND o.email_verified_at IS NOT NULL);--> statement-breakpoint
UPDATE public.users u SET mobile_verified_at = coalesce(a.updated_at, a.created_at, now())
FROM auth."user" a,
     (SELECT DISTINCT ON (x.mobile) x.id FROM public.users x JOIN auth."user" y ON y.id::text = x.auth_subject
      WHERE y.phone_number_verified AND x.mobile IS NOT NULL AND x.mobile_verified_at IS NULL AND x.mobile = y.phone_number
      ORDER BY x.mobile, x.created_at) pick
WHERE u.id = pick.id AND a.id::text = u.auth_subject
  AND NOT EXISTS (SELECT 1 FROM public.users o WHERE o.mobile = u.mobile AND o.mobile_verified_at IS NOT NULL);
