import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';

import { RandomUtil } from '@/utils';
import { SSMethodSchema } from '@/schemas/protocols/shared/shadowsocks';
import { Button, Input, Select } from '@/components/ui';
import { RHFSelect, RHFSwitch, RHFField, Field, useFormContext } from '@/components/form/rhf';

interface ShadowsocksFieldsProps {
  isSSWith2022: boolean;
}

export default function ShadowsocksFields({ isSSWith2022 }: ShadowsocksFieldsProps)
{
    const { t } = useTranslation();
    const { setValue, getValues, register } = useFormContext();
    return (
    <>
      <RHFField
        name="settings.method"
        label={t('pages.inbounds.form.encryptionMethod')}
        render={({ value, onChange }) => (
          <Select
            value={(value as string) ?? ''}
            onChange={(v) =>
            {
                onChange(v);
                setValue('settings.password', RandomUtil.randomShadowsocksPassword(v));
            }}
            options={SSMethodSchema.options.map((m) => ({ value: m, label: m }))}
          />
        )}
      />
      {isSSWith2022 && (
        <Field name="settings.password" label={t('password')}>
          <div className="flex gap-2">
            <Input className="flex-1" {...register('settings.password')} />
            <Button
              variant="secondary"
              size="icon"
              aria-label={t('regenerate')}
              onClick={() =>
              {
                  const method = getValues('settings.method');
                  setValue('settings.password', RandomUtil.randomShadowsocksPassword(method as string));
              }}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </Field>
      )}
      <RHFSelect
        name="settings.network"
        label={t('pages.inbounds.network')}
        options={[
            { value: 'tcp,udp', label: 'TCP, UDP' },
            { value: 'tcp', label: 'TCP' },
            { value: 'udp', label: 'UDP' }
        ]}
      />
      <RHFSwitch name="settings.ivCheck" label="ivCheck" />
    </>
    );
}
