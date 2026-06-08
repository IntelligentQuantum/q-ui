import type { ReactNode } from 'react';
import { showToast, clearToasts, type ToastType } from './Toast';

// Drop-in replacement for AntD's `message` API, backed by our token Toaster.
// Mirrors the surface the panel uses — success/error/warning/info/loading/open
// /destroy plus useMessage()/config() — so existing call sites only swap the
// import. The per-page contextHolder is no longer needed (the Toaster mounts
// once globally), so useMessage() returns a null holder.

type Content = ReactNode;
type Closer = () => void;

interface OpenConfig {
  type?: ToastType;
  content: ReactNode;
  duration?: number;
  onClose?: () => void;
}

function isConfig(value: unknown): value is OpenConfig
{
    return typeof value === 'object' && value !== null && 'content' in value;
}

function fire(type: ToastType, content: Content | OpenConfig, duration?: number, onClose?: () => void): Closer
{
    if (isConfig(content))
    {
        return showToast(content.type ?? type, content.content, content.duration ?? defaultDuration(type), content.onClose);
    }
    return showToast(type, content, typeof duration === 'number' ? duration : defaultDuration(type), onClose);
}

function defaultDuration(type: ToastType): number
{
    // AntD keeps loading toasts up until explicitly closed; others auto-dismiss.
    return type === 'loading' ? 0 : 3;
}

export interface MessageApi {
  success: (content: Content | OpenConfig, duration?: number, onClose?: () => void) => Closer;
  error: (content: Content | OpenConfig, duration?: number, onClose?: () => void) => Closer;
  warning: (content: Content | OpenConfig, duration?: number, onClose?: () => void) => Closer;
  info: (content: Content | OpenConfig, duration?: number, onClose?: () => void) => Closer;
  loading: (content: Content | OpenConfig, duration?: number, onClose?: () => void) => Closer;
  open: (config: OpenConfig) => Closer;
  destroy: () => void;
}

const api: MessageApi = {
    success: (content, duration, onClose) => fire('success', content, duration, onClose),
    error: (content, duration, onClose) => fire('error', content, duration, onClose),
    warning: (content, duration, onClose) => fire('warning', content, duration, onClose),
    info: (content, duration, onClose) => fire('info', content, duration, onClose),
    loading: (content, duration, onClose) => fire('loading', content, duration, onClose),
    open: (config) => fire(config.type ?? 'info', config),
    destroy: () => clearToasts()
};

export const message = {
    ...api,
    /** AntD parity: returns [api, contextHolder]. The Toaster is global, so holder is null. */
    useMessage: (): [MessageApi, null] => [api, null],
    /** AntD parity no-op — positioning/container is handled by the Toaster. */
    config: () =>
    {}
};

export type { Content as MessageContent };
