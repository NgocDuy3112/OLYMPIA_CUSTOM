// Mail — one function, two transports.
//
// The only thing this app needs to send is a verification link. With SMTP
// configured it really sends; without it the message goes to the LOG, loudly, so a
// dev box (and CI) can complete the flow by reading the backend output instead of
// running a mail server. Nothing silently pretends to have sent.
import type { FastifyBaseLogger } from "fastify";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";

export interface Mail {
    to: string;
    subject: string;
    /** plain text — this app sends links, not newsletters */
    text: string;
}

/** Is there a real SMTP server to talk to? (host + from are the minimum) */
export function mailConfigured(): boolean {
    return Boolean(env.smtp.host && env.smtp.from);
}

let transport: Transporter | null = null;

function smtpTransport(): Transporter {
    transport ??= nodemailer.createTransport({
        host: env.smtp.host,
        port: env.smtp.port ? Number(env.smtp.port) : 587,
        // 465 is implicit TLS; everything else upgrades with STARTTLS.
        secure: env.smtp.port === "465",
        ...(env.smtp.user && env.smtp.pass
            ? { auth: { user: env.smtp.user, pass: env.smtp.pass } }
            : {}),
    });
    return transport;
}

export async function sendMail(log: FastifyBaseLogger, mail: Mail): Promise<void> {
    if (!mailConfigured()) {
        log.warn(
            { to: mail.to, subject: mail.subject, text: mail.text },
            "SMTP is not configured — the message below was NOT sent. Set SMTP_HOST/SMTP_FROM to deliver it."
        );
        return;
    }
    await smtpTransport().sendMail({ from: env.smtp.from, to: mail.to, subject: mail.subject, text: mail.text });
}
