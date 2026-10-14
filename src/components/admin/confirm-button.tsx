"use client";

/** Submit button that asks for confirmation before posting. Works without JS as a plain submit. */
export function ConfirmButton({ message, children, className = "btn btn-quiet py-1.5", formAction, name, value }: { message: string; children: React.ReactNode; className?: string; formAction?: (fd: FormData) => void | Promise<void>; name?: string; value?: string }) {
  return (
    <button
      type="submit"
      className={className}
      formAction={formAction}
      name={name}
      value={value}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
