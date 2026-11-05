import Script from "next/script";

// Google Ads tag (gtag.js) for the practitioner-recruitment campaign.
// Loaded on production only so preview/test traffic never reaches the Ads account.
const GOOGLE_ADS_ID = "AW-18555935123";

export function GoogleTag() {
  if (process.env.VERCEL_ENV !== "production") return null;
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
