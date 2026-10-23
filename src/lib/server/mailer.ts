import { env } from '$env/dynamic/private';
import nodemailer from 'nodemailer';

/** Mail needs at least a server and a sender address; credentials are optional (e.g. a local mail catcher). */
export function isMailConfigured(): boolean {
	return Boolean(env.SMTP_HOST && env.SMTP_FROM);
}

function createTransport() {
	const port = Number(env.SMTP_PORT) || 587;
	return nodemailer.createTransport({
		host: env.SMTP_HOST,
		port,
		// Port 465 is TLS from the start; the others upgrade with STARTTLS when the server offers it.
		secure: port === 465,
		auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } : undefined
	});
}

/** Sends a plain-text email through the SMTP server from `.env`. Throws when sending fails. */
export async function sendMail(mail: { to: string; subject: string; text: string }): Promise<void> {
	if (!isMailConfigured()) throw new Error('SMTP is not configured.');

	await createTransport().sendMail({
		from: env.SMTP_FROM,
		to: mail.to,
		subject: mail.subject,
		text: mail.text
	});
}
