"use server";

import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { istToday } from "@/lib/practice/exercise-plans";
import {
  createTemplate,
  extendPackage,
  PAYMENT_MODES,
  recordPayment,
  retireTemplate,
  SaleSchema,
  sellPackage,
  setPackageClosed,
  TemplateSchema,
  undoLastSession,
  recordSessionUse,
} from "@/lib/practice/packages";
import { requireManage } from "@/lib/workspace/context";
import { done, failTo, num, opt, rupeesToPaise, str } from "@/lib/workspace/forms";

const PAGE = "/workspace/packages";

function paise(fd: FormData, name: string, label: string, required = true): number {
  const raw = str(fd, name);
  if (!raw && !required) return 0;
  const v = rupeesToPaise(raw);
  if (v === null) throw new ApiError("INVALID_INPUT", `${label}: enter an amount in rupees`);
  return v;
}

function mode(fd: FormData) {
  const m = opt(fd, "paymentMode");
  return PAYMENT_MODES.some((x) => x.key === m) ? (m as (typeof PAYMENT_MODES)[number]["key"]) : undefined;
}

function back(fd: FormData) {
  return str(fd, "show") === "closed" ? `${PAGE}?show=closed` : PAGE;
}

export async function createTemplateAction(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireManage();
    await createTemplate(practitioner.id, viewer.userId, TemplateSchema.parse({
      name: str(formData, "name"),
      sessions: num(formData, "sessions"),
      pricePaise: paise(formData, "priceRupees", "Price"),
      validityDays: num(formData, "validityDays"),
    }));
    revalidatePath(PAGE);
  } catch (err) {
    failTo(PAGE, err);
  }
  done(PAGE, { ok: "Package added. You can now sell it to patients." });
}

export async function retireTemplateAction(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireManage();
    await retireTemplate(practitioner.id, viewer.userId, str(formData, "templateId"));
    revalidatePath(PAGE);
  } catch (err) {
    failTo(PAGE, err);
  }
  done(PAGE, { ok: "Package removed from sale. Packages already sold are unchanged." });
}

export async function sellAction(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireManage();
    await sellPackage(practitioner.id, viewer.userId, SaleSchema.parse({
      templateId: str(formData, "templateId"),
      patientLabel: str(formData, "patientLabel"),
      paidPaise: paise(formData, "paidRupees", "Amount paid", false),
      paymentMode: mode(formData),
      startsOn: opt(formData, "startsOn") ?? istToday(),
      note: opt(formData, "note"),
    }));
    revalidatePath(PAGE);
  } catch (err) {
    failTo(PAGE, err);
  }
  done(PAGE, { ok: "Package sold." });
}

/** One handler for the per-package buttons; the pressed button carries `op`. */
export async function packageAction(formData: FormData) {
  const to = back(formData);
  let ok = "";
  try {
    const { viewer, practitioner } = await requireManage();
    const id = str(formData, "packageId");
    switch (str(formData, "op")) {
      case "use": {
        const { remaining } = await recordSessionUse(practitioner.id, viewer.userId, id, opt(formData, "usedOn") ?? istToday());
        ok = remaining === 0 ? "Session recorded. That was the last one in this package." : `Session recorded. ${remaining} left.`;
        break;
      }
      case "undo":
        await undoLastSession(practitioner.id, viewer.userId, id);
        ok = "Last session removed.";
        break;
      case "pay":
        await recordPayment(practitioner.id, viewer.userId, id, paise(formData, "amountRupees", "Amount"), mode(formData));
        ok = "Payment recorded.";
        break;
      case "extend":
        await extendPackage(practitioner.id, viewer.userId, id, num(formData, "days") ?? 0);
        ok = "Validity extended.";
        break;
      case "close":
        await setPackageClosed(practitioner.id, viewer.userId, id, true);
        ok = "Package closed.";
        break;
      case "reopen":
        await setPackageClosed(practitioner.id, viewer.userId, id, false);
        ok = "Package reopened.";
        break;
      default:
        throw new ApiError("INVALID_INPUT", "Unknown action");
    }
    revalidatePath(PAGE);
  } catch (err) {
    failTo(to, err);
  }
  done(to, { ok });
}
