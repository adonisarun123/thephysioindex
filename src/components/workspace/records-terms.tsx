/**
 * EMR-01 patient-records terms shown before the feature is switched on.
 * DRAFT for counsel review (Section 26). Version: RECORDS_TERMS_VERSION.
 */
export function RecordsTerms() {
  return (
    <div className="grid gap-2 text-sm">
      <p>Patient records let you keep your patients&rsquo; details, consultation notes and documents in your workspace. Before you switch them on:</p>
      <ol className="ml-5 list-decimal grid gap-1">
        <li><strong>You are responsible for the records.</strong> You decide what to record and why (you are the data fiduciary under the Digital Personal Data Protection Act, 2023). The Physio Index stores and processes the records only on your instructions, to provide this feature.</li>
        <li><strong>Consent.</strong> Add a patient only after telling them you will keep their record here and getting their agreement. You confirm this each time you add a patient.</li>
        <li><strong>Access.</strong> Only you and team members you give patient-record permission can see records. Our staff do not view them except to fix a fault you report or where the law requires, and every access is logged.</li>
        <li><strong>Not shared, not used for anything else.</strong> Records are never shown on your public profile, used for ranking or advertising, or sold.</li>
        <li><strong>Keep only what you need.</strong> Archive patients you no longer treat. Ask us if a patient asks for their record to be corrected or erased.</li>
        <li><strong>If something goes wrong</strong> (a lost phone, a wrongly sent file), tell us at once so we can help you meet your obligations.</li>
      </ol>
      <p className="text-xs text-muted">Draft terms pending legal review; we will ask you to accept again if they change.</p>
    </div>
  );
}
