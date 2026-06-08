import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';

import { DNSRuleActions } from '@/schemas/primitives';
import { Button, Label } from '@/components/ui';
import { RHFText, RHFNumber, RHFSelect, useFieldArray, useFormContext } from '@/components/form/rhf';

export default function DnsFields()
{
    const { t } = useTranslation();
    const { control } = useFormContext();
    const { fields, append, remove } = useFieldArray({ control, name: 'settings.rules' });
    return (
    <>
      <RHFSelect
        name="settings.rewriteNetwork"
        label={t('pages.xray.outboundForm.rewriteNetwork')}
        placeholder={t('pages.xray.outboundForm.unchanged')}
        options={[
            { value: '', label: t('pages.xray.outboundForm.unchanged') },
            { value: 'udp', label: 'udp' },
            { value: 'tcp', label: 'tcp' }
        ]}
      />
      <RHFText
        name="settings.rewriteAddress"
        label={t('pages.inbounds.form.rewriteAddress')}
        placeholder={t('pages.xray.outboundForm.unchangedAddress')}
      />
      <RHFNumber name="settings.rewritePort" label={t('pages.inbounds.form.rewritePort')} min={0} max={65535} />
      <RHFNumber name="settings.userLevel" label={t('pages.xray.tun.userLevel')} min={0} />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Label>{t('pages.xray.outboundForm.rules')}</Label>
          <Button
            size="sm"
            variant="secondary"
            aria-label={t('add')}
            onClick={() => append({ action: 'direct', qType: '', domain: '', rCode: 0 })}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {fields.map((field, index) => (
          <div key={field.id} className="flex flex-col gap-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t('pages.xray.outboundForm.ruleN', { n: index + 1 })}</span>
              <button
                type="button"
                aria-label={t('delete')}
                onClick={() => remove(index)}
                className="text-muted-foreground transition-colors hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <RHFSelect
              name={`settings.rules.${ index }.action`}
              label={t('pages.xray.outboundForm.action')}
              options={DNSRuleActions.map((a) => ({ value: a, label: a }))}
            />
            <RHFText name={`settings.rules.${ index }.qType`} label="QType" placeholder="1,3,23-24" />
            <RHFText name={`settings.rules.${ index }.domain`} label={t('domainName')} placeholder="domain:example.com" />
            <RHFNumber name={`settings.rules.${ index }.rCode`} label="RCode" min={0} max={65535} />
          </div>
        ))}
      </div>
    </>
    );
}
