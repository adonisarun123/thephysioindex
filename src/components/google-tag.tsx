import Script from "next/script";

/**
 * Google Ads tag (gtag.js), loaded site-wide on production only so the
 * conversion linker sees the click id on whichever page an ad lands on.
 * Preview and test traffic never reaches the Ads account.
 * Exception: patient plan links (/plan/...) never load it (HEP-04).
 * The account id comes from NEXT_PUBLIC_GOOGLE_ADS_ID (single source; the
 * join thank-you page reports its conversion through this same tag).
 */
export const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? "";

export function GoogleTag() {
  if (process.env.VERCEL_ENV !== "production" || !/^AW-\d+$/.test(GOOGLE_ADS_ID)) return null;
  // Patient exercise-plan links (/plan/<token>) never load the tag: the URL is
  // the patient's access key and must not reach a third party (HEP-04).
  return (
    <Script id="google-tag" strategy="afterInteractive">
      {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
if (!/^\\/plan\\//.test(location.pathname)) {
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}';
  document.head.appendChild(s);
  gtag('js', new Date());
  gtag('config', '${GOOGLE_ADS_ID}');
}`}
    </Script>
  );
}
