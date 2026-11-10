import { isPermanentStatus, SendError } from "./core";
import { mask } from "./sms";

/**
 * WhatsApp provider adapter (addendum WAP-01, API-01). Business-initiated
 * WhatsApp messages must use a template approved by Meta, so every send names
 * an approved template (`notification_templates.provider_template_id`) and
 * passes the values positionally ({{1}}, {{2}} …) in the order the
 * placeholders first appear in our template body.
 *
 * Providers:
 * - `console` (default): logs the rendered text; for development and previews.
 * - `meta`: WhatsApp Cloud API. Needs WHATSAPP_TOKEN and
 *   WHATSAPP_PHONE_NUMBER_ID. Other BSPs (MSG91, Gupshup …) can be added
 *   behind the same interface.
 */
export type WhatsAppMessage = {
  /** Rendered text, for the console provider and logs. */
  text: string;
  /** Approved template name at the provider. */
  templateName: string | null;
  /** Template language code at the provider, e.g. "en" or "en_US". */
  language: string;
  /** Body parameters in order. */
  params: string[];
};

export interface WhatsAppProvider {
  sendTemplate(phoneE164: string, msg: WhatsAppMessage): Promise<{ providerRef?: string }>;
}

class ConsoleWhatsApp implements WhatsAppProvider {
  async sendTemplate(phone: string, msg: WhatsAppMessage) {
    console.log(`[whatsapp:console] to ${mask(phone)} (${msg.templateName ?? "no template"}): ${msg.text}`);
    return {};
  }
}

class MetaCloudWhatsApp implements WhatsAppProvider {
  constructor(
    private token: string,
    private phoneNumberId: string,
    private apiVersion: string,
  ) {}
  async sendTemplate(phone: string, msg: WhatsAppMessage) {
    if (!msg.templateName) throw new SendError("no approved WhatsApp template name set for this template (admin → Policies and templates)", true);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(`https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.token}` },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone.replace(/^\+/, ""),
          type: "template",
          template: {
            name: msg.templateName,
            language: { code: msg.language },
            components: msg.params.length ? [{ type: "body", parameters: msg.params.map((text) => ({ type: "text", text })) }] : [],
          },
        }),
        signal: ctrl.signal,
      });
      const data = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[]; error?: { message?: string; code?: number } };
      if (!res.ok) throw new SendError(`whatsapp cloud ${res.status}: ${String(data.error?.message ?? "").slice(0, 200)}`, isPermanentStatus(res.status), res.status);
      return { providerRef: data.messages?.[0]?.id };
    } finally {
      clearTimeout(t);
    }
  }
}

let provider: WhatsAppProvider | undefined;
export function whatsapp(): WhatsAppProvider {
  if (!provider) {
    if (process.env.WHATSAPP_PROVIDER === "meta" && process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
      provider = new MetaCloudWhatsApp(process.env.WHATSAPP_TOKEN, process.env.WHATSAPP_PHONE_NUMBER_ID, process.env.WHATSAPP_API_VERSION ?? "v21.0");
    } else {
      provider = new ConsoleWhatsApp();
    }
  }
  return provider;
}

/** Our language code → the provider's template language code. */
export function whatsappLanguage(lang: string): string {
  return process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? (lang === "en" ? "en" : lang);
}
