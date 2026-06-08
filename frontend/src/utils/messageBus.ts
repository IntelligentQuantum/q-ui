import { message, type MessageApi } from '@/components/ui/message';

// The token toast store is global, so the `message` shim toasts from anywhere
// (components or plain modules like HttpUtil). A per-page instance is no longer
// needed; setMessageInstance is kept as a no-op so existing call sites compile
// unchanged during the migration.
export function setMessageInstance(_instance: MessageApi): void
{
    void _instance;
}

export function getMessage(): MessageApi
{
    return message;
}
