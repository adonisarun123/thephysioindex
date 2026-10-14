import { isPermanentStatus, SendError } from "./core";

/**
 * SMS provider adapter (API-01): timeouts, no secrets in logs. The `console`
 * provider is for development and previews. MSG91 requires a DLT-approved
 * template that carries the OTP variable.
 */
export interface SmsProvider {
  sendOtp(phoneE164: string, code: string): Promise<{ providerRef?: string }>;
  sendText(phoneE164: string, text: string, templateId?: string): Promise<{ providerRef?: string }>;
  /**
   * Transactional notification (MSG-01). Indian carriers deliver only
   * DLT-registered templates, so MSG91 needs `providerTemplateId`; the named
   * variables are passed to the MSG91 flow template as-is. `text` is the
   * rendered message, used by the console provider and for logs.
   */
  sendNotification(phoneE164: string, msg: { text: string; providerTemplateId?: string | null; vars: Record<string, string> }): Promise<{ providerRef?: string }>;
}

class ConsoleSms implements SmsProvider {
  async sendOtp(phone: string, code: string) {
    console.log(`[sms:console] OTP for ${mask(phone)}: ${code}`);
    return {};
  }
  async sendText(phone: string, text: string) {
    console.log(`[sms:console] to ${mask(phone)}: ${text}`);
    return {};
  }
  async sendNotification(phone: string, msg: { text: string }) {
    console.log(`[sms:console] to ${mask(phone)}: ${msg.text}`);
    return {};
  }
}

class Msg91Sms implements SmsProvider {
  constructor(
    private authKey: string,
    private otpTemplateId: string,
    private sender: string,
  ) {}
  async sendOtp(phone: string, code: string) {
    const res = await fetchWithTimeout("https://control.msg91.com/api/v5/otp", {
      method: "POST",
      headers: { "Content-Type": "application/json", authkey: this.authKey },
      body: JSON.stringify({ template_id: this.otpTemplateId, mobile: phone.replace(/^\+/, ""), otp: code }),
    });
    if (!res.ok) throw new Error(`msg91 otp failed: ${res.status}`);
    const data = (await res.json().catch(() => ({}))) as { request_id?: string };
    return { providerRef: data.request_id };
  }
  async sendText(phone: string, text: string, templateId?: string) {
    const res = await fetchWithTimeout("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: { "Content-Type": "application/json", authkey: this.authKey },
      body: JSON.stringify({ template_id: templateId, sender: this.sender, recipients: [{ mobiles: phone.replace(/^\+/, ""), text }] }),
    });
    if (!res.ok) throw new SendError(`msg91 flow failed: ${res.status}`, isPermanentStatus(res.status), res.status);
    const data = (await res.json().catch(() => ({}))) as { request_id?: string };
    return { providerRef: data.request_id };
  }
  async sendNotification(phone: string, msg: { text: string; providerTemplateId?: string | null; vars: Record<string, string> }) {
    if (!msg.providerTemplateId) throw new SendError("no DLT template id set for this SMS template (admin → Policies and templates)", true);
    const res = await fetchWithTimeout("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: { "Content-Type": "application/json", authkey: this.authKey },
      body: JSON.stringify({ template_id: msg.providerTemplateId, short_url: "0", recipients: [{ mobiles: phone.replace(/^\+/, ""), ...msg.vars }] }),
    });
    if (!res.ok) throw new SendError(`msg91 flow failed: ${res.status}`, isPermanentStatus(res.status), res.status);
    const data = (await res.json().catch(() => ({}))) as { type?: string; message?: string; request_id?: string };
    if (data.type === "error") throw new SendError(`msg91 rejected: ${String(data.message ?? "unknown").slice(0, 200)}`, true);
    return { providerRef: data.request_id ?? data.message };
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export function mask(phone: string) {
  return phone.replace(/^(\+?\d{2})\d+(\d{3})$/, "$1•••••$2");
}

let provider: SmsProvider | undefined;
export function sms(): SmsProvider {
  if (!provider) {
    if (process.env.SMS_PROVIDER === "msg91" && process.env.MSG91_AUTH_KEY) {
      provider = new Msg91Sms(process.env.MSG91_AUTH_KEY, process.env.MSG91_TEMPLATE_ID ?? "", process.env.MSG91_SENDER ?? "TPIDEX");
    } else {
      provider = new ConsoleSms();
    }
  }
  return provider;
}

/** Normalise an Indian mobile to E.164. Accepts 10 digits, 0-prefixed, 91-prefixed or +91. */
export function normaliseIndianMobile(input: string): string | null {
  const digits = input.replace(/[^\d]/g, "");
  let national = digits;
  if (digits.length === 12 && digits.startsWith("91")) national = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) national = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(national)) return null;
  return `+91${national}`;
}
