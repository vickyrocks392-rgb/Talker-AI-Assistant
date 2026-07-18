import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessibility helper for modal dialogs / drawers / sidebars.
 *
 * - Closes the surface when Escape is pressed.
 * - Traps Tab focus within the surface while open.
 * - Moves focus into the surface on open and restores it to the
 *   previously focused element on close.
 *
 * Attach the returned ref to the dialog container element.
 */
export function useDialogA11y<T extends HTMLElement = HTMLDivElement>(
  isOpen: boolean,
  onClose: () => void
) {
  const ref = useRef<T>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    previousFocus.current = document.activeElement as HTMLElement | null;

    const container = ref.current;
    if (container) {
      // Defer so the element is mounted/visible before focusing.
      const focusFirst = () => {
        const focusable = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        (focusable ?? container).focus();
      };
      const raf = requestAnimationFrame(focusFirst);
      container.setAttribute("tabindex", "-1");

      const handleKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
          return;
        }
        if (e.key !== "Tab") return;

        const focusables = Array.from(
          container!.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        );
        if (focusables.length === 0) {
          e.preventDefault();
          container!.focus();
          return;
        }
        const first = focusables[0] as HTMLElement | undefined;
        const last = focusables[focusables.length - 1] as HTMLElement | undefined;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      };

      document.addEventListener("keydown", handleKey, true);
      return () => {
        cancelAnimationFrame(raf);
        document.removeEventListener("keydown", handleKey, true);
        previousFocus.current?.focus?.();
      };
    }
  }, [isOpen, onClose]);

  return ref;
}