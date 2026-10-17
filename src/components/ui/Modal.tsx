"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}

export function Modal({ open, onOpenChange, title, description, children }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm" />
        <Dialog.Content className="glass fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(640px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl p-6">
          <Dialog.Title className="pr-8 text-xl text-foam">{title}</Dialog.Title>
          {description ? <Dialog.Description className="mt-2 text-sm text-mist">{description}</Dialog.Description> : null}
          <div className="mt-4">{children}</div>
          <Dialog.Close className="absolute right-4 top-4 rounded-full border border-line p-1 text-mist hover:text-foam" aria-label="Close">
            <X size={16} />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
