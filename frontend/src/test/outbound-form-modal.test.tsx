import { describe, it, expect } from 'vitest';

import OutboundFormModal from '@/pages/xray/outbounds/OutboundFormModal';
import { renderWithProviders } from './test-utils';

function renderModal(outbound: Record<string, unknown> | null = null)
{
    return renderWithProviders(
    <OutboundFormModal open outbound={outbound} existingTags={[]} onClose={() =>
    {}} onConfirm={() =>
    {}} />
    );
}

// The form was migrated off AntD to react-hook-form + the token primitives, so
// the old AntD-DOM snapshot harness no longer applies. This is a smoke test that
// the modal mounts and renders its base fields for the default (vless) protocol.
function labelTexts(): string[]
{
    return Array.from(document.querySelectorAll('label'))
        .map((l) => l.textContent?.trim() ?? '')
        .filter(Boolean);
}

describe('OutboundFormModal', () =>
{
    it('renders add mode without crashing', () =>
    {
        renderModal(null);
        expect(document.querySelector('[role="dialog"]')).toBeTruthy();
        const labels = labelTexts();
        expect(labels).toContain('Protocol');
        expect(labels.length).toBeGreaterThan(2);
    });

    it('renders edit mode for an existing outbound', () =>
    {
        renderModal({ protocol: 'vmess', tag: 'proxy', settings: {} });
        expect(document.querySelector('[role="dialog"]')).toBeTruthy();
        expect(labelTexts()).toContain('Protocol');
    });
});
