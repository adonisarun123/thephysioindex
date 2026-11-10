# WhatsApp notifications (WAP-01..03)

Off by default. WhatsApp **replaces SMS** for any user who opted in (account page or workspace settings) and has a verified mobile, once the `messaging.whatsapp` flag is on. Email is unchanged. Dependants without an account stay on SMS.

## Turn it on

1. **Provider.** Code supports the Meta WhatsApp Cloud API directly. A BSP (MSG91, Gupshup, Interakt) can be added behind `src/lib/messaging/whatsapp.ts`.
2. **Business verification and number.** Verify the business in Meta Business Manager and register a sender number. That number then can't be used on the WhatsApp phone app.
3. **Templates.** Create one *Utility* template per WhatsApp row in admin → Policies and templates. Use the same wording, with `{{1}}`, `{{2}}` … in the order the `{{name}}` variables first appear in our body. Example: booking.confirmed has reference, localDateTime, clinicName, locality, manageUrl → `{{1}}`…`{{5}}`. When approved, enter the template name in *Provider template id*.
4. **Vercel env (production):** `WHATSAPP_PROVIDER=meta`, `WHATSAPP_TOKEN` (permanent system-user token), `WHATSAPP_PHONE_NUMBER_ID`. Optional: `WHATSAPP_API_VERSION` (default v21.0) and `WHATSAPP_TEMPLATE_LANGUAGE` (default `en`; set to `en_US` if the templates were created in that locale).
5. **Flag:** admin → Feature flags → `messaging.whatsapp` on.

Without step 4 the console provider logs messages and marks them sent. Do not turn the flag on in production before step 4. A template with no name is marked dead (permanent error), so check Admin → Notifications after enabling.

## Exercise plans

"Send on WhatsApp" on an exercise plan uses click-to-chat (`wa.me`) from the physio's own phone. It needs none of the above.
