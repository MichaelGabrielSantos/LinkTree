"use client";

import { useActionState } from "react";
import { loginAction, signupAction } from "@/app/actions";

function Form({ action, label, next, autoComplete }: { action: typeof loginAction; label: string; next: string; autoComplete: "current-password" | "new-password" }) {
  const [state, formAction, pending] = useActionState(action, null as { error?: string } | null);
  const id = label.replace(/\W/g, "");
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor={`${id}-email`} className="block text-sm font-medium">E-mail</label>
        <input id={`${id}-email`} name="email" type="email" required autoComplete="email" className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2" />
      </div>
      <div>
        <label htmlFor={`${id}-senha`} className="block text-sm font-medium">Senha {autoComplete === "new-password" && <span className="text-ink-3">(mínimo 10 caracteres)</span>}</label>
        <input id={`${id}-senha`} name="password" type="password" required minLength={10} autoComplete={autoComplete} className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2" />
      </div>
      {state?.error && <p role="alert" className="rounded-lg bg-err-bg px-3 py-2 text-sm text-err-ink">{state.error}</p>}
      <button type="submit" disabled={pending} className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-ink disabled:opacity-50">{pending ? "…" : label}</button>
    </form>
  );
}

export function LoginForm({ next }: { next: string }) {
  return <Form action={loginAction} label="Entrar" next={next} autoComplete="current-password" />;
}
export function SignupForm({ next }: { next: string }) {
  return <Form action={signupAction} label="Criar conta" next={next} autoComplete="new-password" />;
}
