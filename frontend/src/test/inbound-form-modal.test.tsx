import { describe, it, expect } from 'vitest';

import InboundFormModal from '@/pages/inbounds/form/InboundFormModal';
import { renderWithProviders } from './test-utils';

function renderModal()
{
    return renderWithProviders(
    <InboundFormModal
      open
      mode="add"
      dbInbound={null}
      dbInbounds={[]}
      availableNodes={[]}
      onClose={() =>
      {}}
      onSaved={() =>
      {}}
    />
    );
}

// Migrated off AntD to react-hook-form + token primitives, so the old AntD-DOM
// snapshot harness no longer applies — smoke test that it mounts.
function labelTexts(): string[]
{
    return Array.from(document.querySelectorAll('label'))
        .map((l) => l.textContent?.trim() ?? '')
        .filter(Boolean);
}

describe('InboundFormModal', () =>
{
    it('renders add mode without crashing', () =>
    {
        renderModal();
        expect(document.querySelector('[role="dialog"]')).toBeTruthy();
        const labels = labelTexts();
        expect(labels).toContain('Protocol');
        expect(labels.length).toBeGreaterThan(3);
    });
});
