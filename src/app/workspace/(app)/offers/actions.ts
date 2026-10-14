"use server";

import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { istToUtc } from "@/lib/workspace/calendar";
import { requireManage } from "@/lib/workspace/context";
import { bool, done, failTo, list, num, opt, rupeesToPaise, str } from "@/lib/workspace/forms";
import { createOfferDraft, OfferInputSchema, setOfferPaused, submitOffer } from "@/lib/workspace/offers";

const PAGE = "/workspace/offers";

/** OFR-03: fixed amount (paise) or percentage (basis points); OFR-06: regular price confirmation is mandatory. */
export async function createOfferAction(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireManage();
    const type = str(formData, "type") === "percentage" ? "percentage" : "fixed";
    let value: number;
    if (type === "fixed") {
      const paise = rupeesToPaise(str(formData, "valueRupees"));
      if (paise === null) throw new ApiError("INVALID_INPUT", "Enter the discount amount in rupees");
      value = paise;
    } else {
      const pct = str(formData, "valuePercent").match(/^(\d{1,3})(?:\.(\d{1,2}))?$/);
      if (!pct) throw new ApiError("INVALID_INPUT", "Enter the percentage, e.g. 10 or 12.5");
      value = Number(pct[1]) * 100 + (pct[2] ? Number(pct[2].padEnd(2, "0")) : 0);
    }
    const minSpend = opt(formData, "minSpendRupees") ? rupeesToPaise(str(formData, "minSpendRupees")) : 0;
    const maxDiscount = opt(formData, "maxDiscountRupees") ? rupeesToPaise(str(formData, "maxDiscountRupees")) : undefined;
    if (minSpend === null || maxDiscount === null) throw new ApiError("INVALID_INPUT", "Minimum spend and maximum discount must be rupee amounts");
    const input = OfferInputSchema.parse({
      title: str(formData, "title"),
      code: opt(formData, "code"),
      type,
      value,
      startsAt: istToUtc(str(formData, "startsOn"), "00:00"),
      endsAt: istToUtc(str(formData, "endsOn"), "23:59"),
      eligibleOfferingIds: list(formData, "eligibleOfferingIds"),
      minSpendPaise: minSpend,
      maxDiscountPaise: maxDiscount,
      totalCap: num(formData, "totalCap"),
      perPatientCap: num(formData, "perPatientCap") ?? 1,
      firstVisitOnly: bool(formData, "firstVisitOnly"),
      automatic: !opt(formData, "code"),
      terms: str(formData, "terms"),
      regularPriceConfirmed: bool(formData, "regularPriceConfirmed"),
    });
    await createOfferDraft(practitioner.id, viewer.userId, input);
    revalidatePath(PAGE);
    done(PAGE, { ok: "Draft offer saved. Submit it for moderation when ready." });
  } catch (err) {
    failTo(`${PAGE}#new`, err);
  }
}

export async function submitOfferAction(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireManage();
    await submitOffer(practitioner.id, viewer.userId, str(formData, "offerId"));
    revalidatePath(PAGE);
    done(PAGE, { ok: "Offer submitted for moderation (OFR-06)" });
  } catch (err) {
    failTo(PAGE, err);
  }
}

export async function pauseOfferAction(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireManage();
    const paused = str(formData, "paused") === "1";
    await setOfferPaused(practitioner.id, viewer.userId, str(formData, "offerId"), paused);
    revalidatePath(PAGE);
    done(PAGE, { ok: paused ? "Offer paused. Accepted booking prices are unchanged." : "Offer resumed" });
  } catch (err) {
    failTo(PAGE, err);
  }
}
