export interface PasswordResetEmail {
  to: string;
  name: string;
  resetUrl: string;
  expiresAt: Date;
}

export interface PasswordChangedEmail {
  to: string;
  name: string;
}

/**
 * Outbound-mail port. The auth service depends on this interface only; a real transport
 * (SES/SMTP via a BullMQ notifications worker — architecture.md §8) is a later drop-in.
 */
export interface EmailSender {
  sendPasswordReset(message: PasswordResetEmail): Promise<void>;
  sendPasswordChangedNotice(message: PasswordChangedEmail): Promise<void>;
}

export type SentEmail =
  | ({ kind: "password_reset" } & PasswordResetEmail)
  | ({ kind: "password_changed" } & PasswordChangedEmail);

/** Captures mail in memory — used by tests to read the reset link the way a user would. */
export class InMemoryEmailSender implements EmailSender {
  readonly sent: SentEmail[] = [];
  async sendPasswordReset(message: PasswordResetEmail) {
    this.sent.push({ kind: "password_reset", ...message });
  }
  async sendPasswordChangedNotice(message: PasswordChangedEmail) {
    this.sent.push({ kind: "password_changed", ...message });
  }
}

/** Dev-only: prints the link. A reset link is a credential, so this must never run in production (server.ts refuses). */
export class ConsoleEmailSender implements EmailSender {
  async sendPasswordReset(m: PasswordResetEmail) {
    console.log(`[email:dev] password reset for ${m.to}: ${m.resetUrl} (expires ${m.expiresAt.toISOString()})`);
  }
  async sendPasswordChangedNotice(m: PasswordChangedEmail) {
    console.log(`[email:dev] password changed notice for ${m.to}`);
  }
}

/**
 * Production placeholder until a real transport exists: logs that mail was NOT sent, and never
 * the link (a reset link is a credential). Password reset therefore can't complete in
 * production until an SES/SMTP sender replaces this — tracked in docs/progress.md.
 */
export class UnconfiguredEmailSender implements EmailSender {
  async sendPasswordReset(m: PasswordResetEmail) {
    console.warn(`[email] no transport configured — password reset for ${m.to} was NOT delivered`);
  }
  async sendPasswordChangedNotice(m: PasswordChangedEmail) {
    console.warn(`[email] no transport configured — password-changed notice for ${m.to} was NOT delivered`);
  }
}
