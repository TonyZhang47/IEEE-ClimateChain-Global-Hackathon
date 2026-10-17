export function pushToast(message: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("hydrotrust-toast", { detail: message }));
}
