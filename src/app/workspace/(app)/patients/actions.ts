"use server";

import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { deleteDocument, DocumentMetaSchema, MAX_DOCUMENT_BYTES, uploadDocument } from "@/lib/practice/documents";
import {
  acceptRecordsTerms,
  addVisit,
  createPatient,
  PatientSchema,
  requirePatientAccess,
  setPatientArchived,
  updatePatient,
  updateVisit,
  VisitSchema,
} from "@/lib/practice/patients";
import { bool, done, failTo, num, opt, str } from "@/lib/workspace/forms";

const PAGE = "/workspace/patients";

function patientInput(fd: FormData) {
  return PatientSchema.parse({
    fullName: str(fd, "fullName"),
    mobile: opt(fd, "mobile"),
    sex: opt(fd, "sex"),
    birthYear: num(fd, "birthYear"),
    address: opt(fd, "address"),
    emergencyContact: opt(fd, "emergencyContact"),
    referredBy: opt(fd, "referredBy"),
    medicalHistory: opt(fd, "medicalHistory"),
    notes: opt(fd, "notes"),
  });
}

function visitInput(fd: FormData) {
  return VisitSchema.parse({
    visitOn: str(fd, "visitOn"),
    kind: str(fd, "kind"),
    chiefComplaint: opt(fd, "chiefComplaint"),
    history: opt(fd, "history"),
    painScore: num(fd, "painScore"),
    findings: opt(fd, "findings"),
    diagnosis: opt(fd, "diagnosis"),
    treatmentGiven: opt(fd, "treatmentGiven"),
    plan: opt(fd, "plan"),
    nextVisitOn: opt(fd, "nextVisitOn"),
  });
}

/** EMR-01: only the profile owner accepts the patient-records terms. */
export async function acceptTermsAction(formData: FormData) {
  try {
    const { viewer, practitioner } = await requirePatientAccess("write");
    if (!practitioner.isOwner) throw new ApiError("UNAUTHORISED", "Only the profile owner can accept these terms");
    if (!bool(formData, "accept")) throw new ApiError("INVALID_INPUT", "Tick the box to accept the terms");
    await acceptRecordsTerms(practitioner.id, viewer.userId);
    revalidatePath(PAGE);
  } catch (err) {
    failTo(PAGE, err);
  }
  done(PAGE, { ok: "Patient records are on. Add your first patient." });
}

export async function createPatientAction(formData: FormData) {
  let id: string;
  try {
    const { viewer, practitioner } = await requirePatientAccess("write");
    id = await createPatient(practitioner.id, viewer.userId, patientInput(formData), bool(formData, "consent"));
    revalidatePath(PAGE);
  } catch (err) {
    failTo(PAGE, err);
  }
  done(`${PAGE}/${id}`, { ok: "Patient added." });
}

export async function updatePatientAction(formData: FormData) {
  const id = str(formData, "patientId");
  try {
    const { viewer, practitioner } = await requirePatientAccess("write");
    await updatePatient(practitioner.id, viewer.userId, id, patientInput(formData));
    revalidatePath(`${PAGE}/${id}`);
  } catch (err) {
    failTo(`${PAGE}/${id}`, err);
  }
  done(`${PAGE}/${id}`, { ok: "Details saved." });
}

export async function archivePatientAction(formData: FormData) {
  const id = str(formData, "patientId");
  const archived = str(formData, "archived") === "1";
  try {
    const { viewer, practitioner } = await requirePatientAccess("write");
    await setPatientArchived(practitioner.id, viewer.userId, id, archived);
    revalidatePath(PAGE);
  } catch (err) {
    failTo(`${PAGE}/${id}`, err);
  }
  done(`${PAGE}/${id}`, { ok: archived ? "Patient archived. The record is kept and can be restored." : "Patient restored." });
}

export async function addVisitAction(formData: FormData) {
  const id = str(formData, "patientId");
  try {
    const { viewer, practitioner } = await requirePatientAccess("write");
    await addVisit(practitioner.id, viewer.userId, id, visitInput(formData));
    revalidatePath(`${PAGE}/${id}`);
  } catch (err) {
    failTo(`${PAGE}/${id}`, err);
  }
  done(`${PAGE}/${id}`, { ok: "Note saved." });
}

export async function updateVisitAction(formData: FormData) {
  const id = str(formData, "patientId");
  try {
    const { viewer, practitioner } = await requirePatientAccess("write");
    await updateVisit(practitioner.id, viewer.userId, str(formData, "visitId"), visitInput(formData));
    revalidatePath(`${PAGE}/${id}`);
  } catch (err) {
    failTo(`${PAGE}/${id}`, err);
  }
  done(`${PAGE}/${id}`, { ok: "Note updated." });
}

export async function uploadDocumentAction(formData: FormData) {
  const id = str(formData, "patientId");
  try {
    const { viewer, practitioner } = await requirePatientAccess("write");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ApiError("INVALID_INPUT", "Choose a file to upload");
    if (file.size > MAX_DOCUMENT_BYTES) throw new ApiError("INVALID_INPUT", "Files can be up to 4 MB. Take a smaller photo or compress the PDF.");
    const meta = DocumentMetaSchema.parse({ title: str(formData, "title") || file.name.replace(/\.[^.]+$/, ""), category: str(formData, "category"), docDate: opt(formData, "docDate") });
    await uploadDocument(practitioner.id, viewer.userId, id, meta, { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) });
    revalidatePath(`${PAGE}/${id}`);
  } catch (err) {
    failTo(`${PAGE}/${id}`, err);
  }
  done(`${PAGE}/${id}`, { ok: "Document uploaded." });
}

export async function deleteDocumentAction(formData: FormData) {
  const id = str(formData, "patientId");
  try {
    const { viewer, practitioner } = await requirePatientAccess("write");
    await deleteDocument(practitioner.id, viewer.userId, str(formData, "documentId"));
    revalidatePath(`${PAGE}/${id}`);
  } catch (err) {
    failTo(`${PAGE}/${id}`, err);
  }
  done(`${PAGE}/${id}`, { ok: "Document deleted." });
}
