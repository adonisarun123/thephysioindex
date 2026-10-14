import Script from "next/script";

/**
 * Google Ads site tag, loaded only on the paid-acquisition pages
 * (/for-physiotherapists/join and its thank-you page), never site-wide.
 * The landing page stores the click id (conversion linker); the thank-you
 * page passes `conversionRef` to report the sign-up. `transaction_id` makes
 * Google Ads count a refreshed thank-you page once.
 * Renders nothing when NEXT_PUBLIC_GOOGLE_ADS_ID is unset.
 */
const ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? "";
const SIGNUP_LABEL = process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL ?? "";
const SAFE = /^[A-Za-z0-9_-]+$/;

export function GoogleAdsTag({ conversionRef }: { conversionRef?: string }) {
  if (!/^AW-\d+$/.test(ADS_ID)) return null;
  const conversion =
    conversionRef && SAFE.test(conversionRef) && SAFE.test(SIGNUP_LABEL)
      ? `gtag('event','conversion',{send_to:'${ADS_ID}/${SIGNUP_LABEL}',transaction_id:'${conversionRef}'});`
      : "";
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${ADS_ID}`} strategy="afterInteractive" />
      <Script id={conversion ? "gads-init-conv" : "gads-init"} strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ADS_ID}');${conversion}`}
      </Script>
    </>
  );
}
