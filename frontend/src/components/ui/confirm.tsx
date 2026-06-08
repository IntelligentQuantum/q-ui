import { useState } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Modal } from './Modal';
import { Button } from './Button';

export interface ConfirmOptions {
  title: ReactNode;
  description?: ReactNode;
  confirmText?: ReactNode;
  cancelText?: ReactNode;
  /** Style the confirm action as destructive. */
  danger?: boolean;
}

/**
 * Imperative confirmation dialog — `if (await confirm({ title }))`. Mounts a
 * self-contained Modal into a throwaway portal host and resolves to the user's
 * choice. Replacement for AntD's `Modal.confirm`. Token-only.
 */
export function confirm(opts: ConfirmOptions): Promise<boolean>
{
    return new Promise((resolve) =>
    {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);

        const finish = (result: boolean) =>
        {
            resolve(result);
            // Defer unmount so the close transition can run / React can settle.
            window.setTimeout(() =>
            {
                root.unmount();
                host.remove();
            }, 150);
        };

        function ConfirmHost()
        {
            const [open, setOpen] = useState(true);
            const close = (result: boolean) =>
            {
                setOpen(false);
                finish(result);
            };
            return (
        <Modal
          open={open}
          onClose={() => close(false)}
          size="sm"
          title={opts.title}
          description={opts.description}
          footer={
            <>
              <Button variant="secondary" onClick={() => close(false)}>
                {opts.cancelText ?? 'Cancel'}
              </Button>
              <Button variant={opts.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
                {opts.confirmText ?? 'Confirm'}
              </Button>
            </>
          }
        />
            );
        }

        root.render(<ConfirmHost />);
    });
}
