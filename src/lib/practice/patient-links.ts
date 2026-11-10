import { ApiError } from "@/lib/api";
import { patientOptions, recordsTermsAccepted, requirePatientAccess } from "./patients";

/** Patient picker options for plans/packages (EMR-05): empty unless the viewer can write records and the practice has records on. */
export async function linkablePatients(): Promise<{ id: string; label: string; firstName: string }[]> {
  try {
    const { practitioner } = await requirePatientAccess("write");
    if (!(await recordsTermsAccepted(practitioner.id))) return [];
    return await patientOptions(practitioner.id);
  } catch (err) {
    if (err instanceof ApiError) return [];
    throw err;
  }
}
