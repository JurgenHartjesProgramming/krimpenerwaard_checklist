"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import type { ActionResult } from "@/lib/action";

interface Props<T> {
  action: (fd: FormData) => Promise<ActionResult<T>>;
  children: ReactNode;
  className?: string;
  /** Clear the form after a successful submit (e.g. "add comment"). */
  resetOnSuccess?: boolean;
  onSuccess?: (data: T | undefined) => void;
  /** Ask for confirmation before submitting. */
  confirm?: string;
  successMessage?: string;
}

/**
 * Form that submits to a server action returning ActionResult and shows the
 * (Dutch) error message inline, e.g. optimistic-locking conflicts.
 */
export function ActionForm<T>({
  action,
  children,
  className,
  resetOnSuccess,
  onSuccess,
  confirm,
  successMessage,
}: Props<T>) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      ref={formRef}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const fd = new FormData(e.currentTarget);
        setError(null);
        setMessage(null);
        startTransition(async () => {
          const result = await action(fd);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          if (resetOnSuccess) formRef.current?.reset();
          if (successMessage) setMessage(successMessage);
          onSuccess?.(result.data);
          router.refresh();
        });
      }}
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {error && (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {message && <p className="mt-2 text-sm text-green-700">{message}</p>}
    </form>
  );
}

/** Button that runs an action with confirmation, e.g. delete. */
export function ActionButton({
  run,
  confirm,
  children,
  className = "btn-danger",
  onSuccess,
}: {
  run: () => Promise<ActionResult<unknown>>;
  confirm?: string;
  children: ReactNode;
  className?: string;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        startTransition(async () => {
          const result = await run();
          if (!result.ok) {
            window.alert(result.error);
            return;
          }
          onSuccess?.();
          router.refresh();
        });
      }}
    >
      {children}
    </button>
  );
}
