import { isPermanentStatus, SendError } from "./core";

/** Email provider adapter: Resend when configured, console otherwise (API-01). */
export interface EmailProvider {
  send(to: string, subject: string, text: string, html?: string): Promise<{ providerRef?: string }>;
}

class ConsoleEmail implements EmailProvider {
  async send(to: string, subject: string, text: string) {
    console.log(`[email:console] to ${to} | ${subject}\n${text}`);
    return {};
  }
}

class ResendEmail implements EmailProvider {
  constructor(
    private apiKey: string,
    private from: string,
  ) {}
  async send(to: string, subject: string, text: string, html?: string) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ from: this.from, to: [to], subject, text, html }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new SendError(`resend failed: ${res.status}`, isPermanentStatus(res.status), res.status);
      const data = (await res.json().catch(() => ({}))) as { id?: string };
      return { providerRef: data.id };
    } finally {
      clearTimeout(t);
    }
  }
}

let provider: EmailProvider | undefined;
export function email(): EmailProvider {
  if (!provider) {
    provider =
      process.env.EMAIL_PROVIDER === "resend" && process.env.RESEND_API_KEY
        ? new ResendEmail(process.env.RESEND_API_KEY, process.env.EMAIL_FROM ?? "The Physio Index <no-reply@thephysioindex.com>")
        : new ConsoleEmail();
  }
  return provider;
}
