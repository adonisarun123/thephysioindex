import Script from "next/script";

/**
 * Google Ads tag (gtag.js), loaded site-wide on production only so the
 * conversion linker sees the click id on whichever page an ad lands on.
 * Preview and test traffic never reaches the Ads account.
 * The account id comes from NEXT_PUBLIC_GOOGLE_ADS_ID (single source; the
 * join thank-you page reports its conversion through this same tag).
 */
export const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? "";

export function GoogleTag() {
  if (process.env.VERCEL_ENV !== "production" || !/^AW-\d+$/.test(GOOGLE_ADS_ID)) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`} strategy="afterInteractive" />
      <Script id="google-tag" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GOOGLE_ADS_ID}');`}
      </Script>
    </>
  );
}
