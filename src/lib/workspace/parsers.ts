import { ApiError } from "@/lib/api";
import { normaliseIndianMobile } from "@/lib/messaging/sms";
import { type OfferingDefaults } from "./catalog";
import { NewClinicBranchSchema, type NewClinicBranch } from "./clinics";
import { CredentialInputSchema, type CredentialInput } from "./credentials";
import { ExperienceSchema, PortfolioSchema, QualificationSchema, SpecialtiesSchema } from "./draft";
import { list, num, opt, rows, rupeesToPaise, str } from "./forms";
import { OfferingInputSchema, type OfferingInput } from "./offerings";

/** FormData → validated inputs shared by the onboarding wizard and the workspace editors. */

export function parseOfferingForm(fd: FormData, d: OfferingDefaults): OfferingInput {
  const fee = rupeesToPaise(str(fd, "feeRupees"));
  if (fee === null) throw new ApiError("INVALID_INPUT", "Enter the fee in rupees, e.g. 600 or 600.50");
  const tax = str(fd, "taxRupees") ? rupeesToPaise(str(fd, "taxRupees")) : 0;
  const extra = str(fd, "extraRupees") ? rupeesToPaise(str(fd, "extraRupees")) : 0;
  if (tax === null || extra === null) throw new ApiError("INVALID_INPUT", "Taxes and extra charges must be amounts in rupees");
  return OfferingInputSchema.parse({
    serviceId: str(fd, "serviceId"),
    displayName: str(fd, "displayName"),
    description: opt(fd, "description") ?? "",
    basePricePaise: fee,
    taxPaise: tax,
    extraChargesPaise: extra,
    priceNote: opt(fd, "priceNote") ?? "",
    durationMin: num(fd, "durationMin") ?? d.durationMin,
    intervalMin: num(fd, "intervalMin") ?? d.intervalMin,
    bufferBeforeMin: num(fd, "bufferBeforeMin") ?? d.bufferBeforeMin,
    bufferAfterMin: num(fd, "bufferAfterMin") ?? d.bufferAfterMin,
    minNoticeMin: num(fd, "minNoticeMin") ?? d.minNoticeMin,
    bookingHorizonDays: num(fd, "bookingHorizonDays") ?? d.horizonDays,
  });
}

export function parseClinicForm(fd: FormData): NewClinicBranch {
  const phoneRaw = opt(fd, "phone");
  const phone = phoneRaw ? normaliseIndianMobile(phoneRaw) ?? phoneRaw : "";
  const localityId = opt(fd, "localityId");
  return NewClinicBranchSchema.parse({
    clinicName: str(fd, "clinicName"),
    branchName: opt(fd, "branchName") ?? "",
    addressLine1: str(fd, "addressLine1"),
    addressLine2: opt(fd, "addressLine2") ?? "",
    stateId: str(fd, "stateId"),
    cityId: str(fd, "cityId"),
    localityId: localityId && localityId !== "__new" ? localityId : undefined,
    newLocalityName: localityId === "__new" || !localityId ? opt(fd, "newLocalityName") : undefined,
    pinCode: str(fd, "pinCode"),
    phone,
  });
}

export function parseCredentialForm(fd: FormData): CredentialInput {
  const type = opt(fd, "type");
  return CredentialInputSchema.parse({
    authorityId: str(fd, "authorityId"),
    type: type || undefined,
    number: str(fd, "number"),
    issueDate: opt(fd, "issueDate"),
    expiresOn: opt(fd, "expiresOn"),
  });
}

export function parseQualifications(fd: FormData) {
  return rows(fd, "q").map((r) =>
    QualificationSchema.parse({
      degree: r.degree ?? "",
      institution: r.institution ?? "",
      completionYear: r.completionYear ? Number(r.completionYear) : null,
      inProgress: r.inProgress === "on" || r.inProgress === "true",
    }),
  );
}

export function parseExperiences(fd: FormData) {
  return rows(fd, "e").map((r) =>
    ExperienceSchema.parse({
      role: r.role ?? "",
      organisationName: r.organisationName ?? "",
      startMonth: r.startMonth ?? "",
      endMonth: r.endMonth ? r.endMonth : null,
      description: r.description ?? "",
    }),
  );
}

export function parsePortfolio(fd: FormData) {
  return rows(fd, "p").map((r) =>
    PortfolioSchema.parse({
      kind: r.kind ?? "certification",
      title: r.title ?? "",
      issuer: r.issuer ?? "",
      itemDate: r.itemDate ? r.itemDate : null,
      url: r.url ? r.url : null,
      description: r.description ?? "",
    }),
  );
}

export function parseSpecialties(fd: FormData) {
  const chosen = list(fd, "specialtyIds");
  const primary = opt(fd, "primarySpecialtyId");
  const ids = primary && !chosen.includes(primary) ? [...chosen, primary] : chosen;
  return SpecialtiesSchema.parse(ids.map((id) => ({ specialtyId: id, isPrimary: id === primary })));
}

export function parseLanguages(fd: FormData) {
  return list(fd, "languageIds");
}

