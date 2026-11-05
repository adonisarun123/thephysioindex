import Script from "next/script";
import { GOOGLE_ADS_ID } from "@/components/google-tag";

/**
 * Reports the practitioner sign-up conversion on the join thank-you page.
 * gtag.js itself is loaded site-wide by <GoogleTag /> in the root layout
 * (production only); this component only queues the conversion event, so
 * the tag is never loaded twice and preview sign-ups never count.
 * `transaction_id` makes Google Ads count a refreshed thank-you page once.
 * Renders nothing without a conversion reference or outside production.
 */
const SIGNUP_LABEL = process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL ?? "";
const SAFE = /^[A-Za-z0-9_-]+$/;

export function GoogleAdsTag({ conversionRef }: { conversionRef?: string }) {
  if (process.env.VERCEL_ENV !== "production") return null;
  if (!/^AW-\d+$/.test(GOOGLE_ADS_ID) || !conversionRef || !SAFE.test(conversionRef) || !SAFE.test(SIGNUP_LABEL)) return null;
  return (
    <Script id="gads-conversion" strategy="afterInteractive">
      {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('event','conversion',{send_to:'${GOOGLE_ADS_ID}/${SIGNUP_LABEL}',transaction_id:'${conversionRef}'});`}
    </Script>
  );
}
