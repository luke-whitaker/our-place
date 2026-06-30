// Transactional email via Resend's REST API.
//
// Deliberately dependency-free — a plain fetch with a bearer token, mirroring the
// aws4fetch approach in storage.ts rather than pulling in an SDK. Swapping the
// provider later means reimplementing only `sendEmail` (its callers are
// provider-agnostic).
//
// Configure with:
//   RESEND_API_KEY  — from the Resend dashboard (required in production)
//   EMAIL_FROM      — a verified sender, e.g. "Our Place <noreply@ourplaceonline.com>"
//
// Dev fallback: with no RESEND_API_KEY, messages are logged to the server console
// instead of sent, so local flows (password reset) work without a provider.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

function getFrom(): string {
  // Resend's shared onboarding sender works for first-run testing; production
  // should set EMAIL_FROM to a sender on a domain verified in Resend.
  return process.env.EMAIL_FROM || "Our Place <onboarding@resend.dev>";
}

/**
 * Send a transactional email. Resolves on success; throws on a hard provider
 * error so callers can log it. In development without RESEND_API_KEY, logs the
 * message and resolves (no send).
 */
export async function sendEmail({ to, subject, html, text }: SendEmailParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is not set — cannot send email in production.");
    }
    console.log(`[EMAIL:dev] To: ${to}\n  Subject: ${subject}\n  ${text}`);
    return;
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: getFrom(), to, subject, html, text }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Email send failed (${res.status}): ${detail.slice(0, 200)}`);
  }
}

/** Deliver a password-reset code. Plain-text + a minimal inline-styled HTML body. */
export async function sendPasswordResetCode(to: string, code: string): Promise<void> {
  const text =
    `Your Our Place password reset code is ${code}\n\n` +
    `It expires in 30 minutes. If you didn't request a reset, you can safely ignore this email.`;

  const html = `
  <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
    <h1 style="font-size: 18px; margin: 0 0 16px;">Reset your Our Place password</h1>
    <p style="font-size: 14px; line-height: 1.5; margin: 0 0 16px;">
      Use this code to reset your password. It expires in 30 minutes.
    </p>
    <div style="font-size: 32px; font-weight: 700; letter-spacing: 6px; text-align: center;
                padding: 16px; background: #f4f4f5; border-radius: 12px; margin: 0 0 16px;">
      ${code}
    </div>
    <p style="font-size: 12px; line-height: 1.5; color: #71717a; margin: 0;">
      If you didn't request a reset, you can safely ignore this email — your password won't change.
    </p>
  </div>`;

  await sendEmail({ to, subject: "Your Our Place password reset code", html, text });
}
