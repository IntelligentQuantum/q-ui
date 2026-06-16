import { useTranslation } from 'react-i18next';

import { Accordion, Checkbox, Input } from '@/components/ui';

interface EventGroup
{
    key: string;
    labelKey: string;
    events: { value: string; labelKey: string }[];
}

// Event taxonomy mirrors the backend eventbus topics. Grouped so the panel can
// collapse/expand related events and toggle a whole group at once.
const EVENT_GROUPS: EventGroup[] = [
    { key: 'outbound', labelKey: 'pages.settings.eventGroupOutbound', events: [
        { value: 'outbound.down', labelKey: 'pages.settings.eventOutboundDown' },
        { value: 'outbound.up', labelKey: 'pages.settings.eventOutboundUp' }
    ] },
    { key: 'xray', labelKey: 'pages.settings.eventGroupXray', events: [
        { value: 'xray.crash', labelKey: 'pages.settings.eventXrayCrash' }
    ] },
    { key: 'node', labelKey: 'pages.settings.eventGroupNode', events: [
        { value: 'node.down', labelKey: 'pages.settings.eventNodeDown' },
        { value: 'node.up', labelKey: 'pages.settings.eventNodeUp' }
    ] },
    { key: 'system', labelKey: 'pages.settings.eventGroupSystem', events: [
        { value: 'cpu.high', labelKey: 'pages.settings.eventCPUHigh' }
    ] },
    { key: 'security', labelKey: 'pages.settings.eventGroupSecurity', events: [
        { value: 'login.attempt', labelKey: 'pages.settings.eventLoginAttempt' }
    ] }
];

interface EventBusCheckboxesProps
{
    value: string;
    onChange: (v: string) => void;
    // Optional per-event numeric input (e.g. the cpu.high threshold).
    extra?: Record<string, { key: string; value: number }>;
    onExtraChange?: (key: string, v: number) => void;
}

// Renders the comma-separated `value` as a grouped set of event checkboxes.
export function EventBusCheckboxes({ value, onChange, extra, onExtraChange }: EventBusCheckboxesProps)
{
    const { t } = useTranslation();
    const selected = value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [];

    function toggle(eventType: string)
    {
        const next = selected.includes(eventType)
            ? selected.filter((e) => e !== eventType)
            : [...selected, eventType];
        onChange(next.join(','));
    }

    function toggleGroup(group: EventGroup)
    {
        const groupValues = group.events.map((e) => e.value);
        const allSelected = groupValues.every((v) => selected.includes(v));
        const next = allSelected
            ? selected.filter((v) => !groupValues.includes(v))
            : [...new Set([...selected, ...groupValues])];
        onChange(next.join(','));
    }

    const items = EVENT_GROUPS.map((group) =>
    {
        const count = group.events.filter((e) => selected.includes(e.value)).length;
        const total = group.events.length;
        const allSelected = count === total;
        return {
            key: group.key,
            label: (
                <div className="flex items-center gap-2">
                    <span className="font-medium">{t(group.labelKey)}</span>
                    <span className="text-xs text-muted-foreground">{count}/{total}</span>
                    <div className="flex lg:justify-end" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                            checked={allSelected}
                            onChange={() => toggleGroup(group)}
                            className={count > 0 && count < total ? 'opacity-50' : ''}
                        />
                    </div>
                </div>
            ),
            children: (
                <div className="flex flex-col gap-3">
                    {group.events.map((et) =>
                    {
                        const checked = selected.includes(et.value);
                        const extraConf = extra?.[et.value];
                        return (
                            <div key={et.value} className="flex items-center gap-3">
                                <Checkbox checked={checked} onChange={() => toggle(et.value)}>{t(et.labelKey)}</Checkbox>
                                {extraConf && onExtraChange && (
                                    <Input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={extraConf.value}
                                        disabled={!checked}
                                        onChange={(e) => onExtraChange(extraConf.key, Number(e.target.value) || 0)}
                                        className="w-16"
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            )
        };
    });

    const defaultActiveKeys = EVENT_GROUPS
        .filter((g) => g.events.some((e) => selected.includes(e.value)))
        .map((g) => g.key);
    return <Accordion items={items} defaultActiveKeys={defaultActiveKeys.length > 0 ? defaultActiveKeys : ['outbound']} />;
}
