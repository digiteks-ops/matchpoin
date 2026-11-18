import { SMTPClient } from "emailjs";

interface SmtpConfiguration {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
}

function getSmtpConfiguration(): SmtpConfiguration {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD;

  if (!host || !from || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_HOST, SMTP_FROM, and a valid SMTP_PORT are required.");
  }
  if (Boolean(user) !== Boolean(password)) {
    throw new Error("SMTP_USER and SMTP_PASSWORD must either both be set or both be empty.");
  }

  return { host, from, port, secure: port === 465, user: user || undefined, password };
}

export function assertPasswordRecoveryEmailConfigured(): void {
  getSmtpConfiguration();
}

export async function sendPasswordRecoveryEmail(email: string, resetUrl: string): Promise<void> {
  const config = getSmtpConfiguration();
  const client = new SMTPClient({
    host: config.host,
    port: config.port,
    ssl: config.secure,
    tls: config.secure ? false : { minVersion: "TLSv1.2" },
    ...(config.user && config.password
      ? { user: config.user, password: config.password }
      : {}),
    timeout: 15_000,
  });

  const safeUrl = resetUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  try {
    await client.sendAsync({
      from: config.from,
      to: email,
      subject: "Reset password MATCHPOIN",
      text: `Use this link within 30 minutes to reset your MATCHPOIN password: ${resetUrl}`,
      attachment: [
        {
          data: `<p>Someone requested a password reset for your MATCHPOIN account.</p>
            <p><a href="${safeUrl}">Reset your password</a></p>
            <p>This link expires in 30 minutes. If you did not request it, you can ignore this email.</p>`,
          alternative: true,
          type: "text/html",
        },
      ],
    });
  } finally {
    client.smtp.close();
  }
}
