"use client";

import { useId, useRef, useState } from "react";

const ENDPOINT = "https://api.web3forms.com/submit";

/**
 * Public by design — Web3Forms rate-limits and filters on their side, and the
 * key only ever grants permission to send a message to the inbox it is bound
 * to. It is not a secret, which is the whole reason this needs no server.
 */
const ACCESS_KEY = process.env.NEXT_PUBLIC_WEB3FORMS_KEY;

type Field = "name" | "email" | "message";
type Status = "idle" | "sending" | "sent" | "failed";

const LABELS: Record<Field, string> = {
  name: "Name",
  email: "Email",
  message: "Message",
};

/**
 * Checked client-side so a typo is caught before a round trip, and again by
 * Web3Forms. Deliberately permissive: the only address this can reject that a
 * real person would type is one that is genuinely malformed, and a form that
 * argues with a valid address is worse than one that lets a bounce happen.
 */
function validate(values: Record<Field, string>) {
  const errors: Partial<Record<Field, string>> = {};
  if (!values.name.trim()) errors.name = "Please give a name to reply to.";
  if (!values.email.trim()) errors.email = "Please give an email address.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()))
    errors.email = "That does not look like an email address.";
  if (values.message.trim().length < 10) errors.message = "A little more detail, please.";
  return errors;
}

const FIELD_CLASS =
  "mt-2 w-full rounded-none border-b border-hairline bg-transparent pb-2 font-mono text-[0.95rem] text-fg outline-none transition-colors placeholder:text-mute/60 focus:border-accent";

export default function ContactForm() {
  const formId = useId();
  const [values, setValues] = useState<Record<Field, string>>({
    name: "",
    email: "",
    message: "",
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [status, setStatus] = useState<Status>("idle");
  const [failure, setFailure] = useState("");
  // Bots fill every field they find. A real visitor never sees this one.
  const honeypot = useRef<HTMLInputElement>(null);

  const update = (field: Field, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    // Clear the complaint as soon as they start addressing it, rather than
    // leaving it up until the next submit.
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;

    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      document.getElementById(`${formId}-${Object.keys(found)[0]}`)?.focus();
      return;
    }

    if (!ACCESS_KEY) {
      setStatus("failed");
      setFailure("The form is not configured yet. Please reach out on LinkedIn in the meantime.");
      return;
    }

    setStatus("sending");
    setFailure("");

    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_key: ACCESS_KEY,
          subject: `Portfolio enquiry from ${values.name.trim()}`,
          from_name: "alexvoneida.com",
          name: values.name.trim(),
          email: values.email.trim(),
          message: values.message.trim(),
          botcheck: honeypot.current?.checked ?? false,
        }),
      });
      const result = (await response.json()) as { success?: boolean; message?: string };

      if (!response.ok || !result.success) {
        throw new Error(result.message ?? `Request failed (${response.status})`);
      }

      setStatus("sent");
      setValues({ name: "", email: "", message: "" });
    } catch (error) {
      setStatus("failed");
      // The visitor gets a way out, not the cause. Whatever went wrong — an
      // offline browser, a bad key, a rejected send — none of it is theirs to
      // fix, and "Failed to fetch" is a developer's string, not a message to a
      // recruiter who has just typed a paragraph. The detail goes to the
      // console, where it is of use to someone who can act on it.
      console.error("Contact form submission failed:", error);
      setFailure("That did not send. Please try again, or reach me on LinkedIn.");
    }
  }

  if (status === "sent") {
    return (
      <div className="mt-8 border-l border-accent pl-5" role="status">
        <p className="font-mono text-sm text-accent">Message sent</p>
        <p className="mt-3 text-[1.05rem] leading-relaxed text-fg/85">
          Thanks — I will get back to you shortly.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-5 font-mono text-sm text-mute underline-offset-4 transition-colors hover:text-fg hover:underline"
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-8 max-w-lg">
      <div className="grid gap-7 sm:grid-cols-2">
        {(["name", "email"] as const).map((field) => (
          <div key={field}>
            <label htmlFor={`${formId}-${field}`} className="field-label">
              {LABELS[field]}
            </label>
            <input
              id={`${formId}-${field}`}
              name={field}
              type={field === "email" ? "email" : "text"}
              autoComplete={field === "email" ? "email" : "name"}
              value={values[field]}
              onChange={(event) => update(field, event.target.value)}
              aria-invalid={errors[field] ? true : undefined}
              aria-describedby={errors[field] ? `${formId}-${field}-error` : undefined}
              className={FIELD_CLASS}
            />
            {errors[field] && (
              <p id={`${formId}-${field}-error`} className="mt-2 font-mono text-xs text-accent">
                {errors[field]}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-7">
        <label htmlFor={`${formId}-message`} className="field-label">
          {LABELS.message}
        </label>
        <textarea
          id={`${formId}-message`}
          name="message"
          rows={4}
          value={values.message}
          onChange={(event) => update("message", event.target.value)}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={errors.message ? `${formId}-message-error` : undefined}
          className={`${FIELD_CLASS} resize-y leading-relaxed`}
        />
        {errors.message && (
          <p id={`${formId}-message-error`} className="mt-2 font-mono text-xs text-accent">
            {errors.message}
          </p>
        )}
      </div>

      {/* Off-screen rather than display:none — a bot reading the DOM fills what
          it can see in the markup, and a hidden input is a known tell. */}
      <input
        ref={honeypot}
        type="checkbox"
        name="botcheck"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
      />

      <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3">
        <button
          type="submit"
          disabled={status === "sending"}
          className="rounded-full bg-accent px-5 py-2.5 font-mono text-sm text-ground transition-colors hover:bg-fg disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "sending" ? "Sending…" : "Send message"}
        </button>
        <p className="font-mono text-xs text-mute" role="status" aria-live="polite">
          {status === "failed" ? failure : ""}
        </p>
      </div>
    </form>
  );
}
