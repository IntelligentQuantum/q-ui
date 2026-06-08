import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Input, Label, Modal, Select } from '@/components/ui';
import { message } from '@/components/ui/message';
import { HttpUtil } from '@/utils';
import { CustomGeoFormSchema } from '@/schemas/xray';

export interface CustomGeoRecord {
  id: number;
  type: 'geosite' | 'geoip';
  alias: string;
  url: string;
}

interface CustomGeoFormModalProps {
  open: boolean;
  record: CustomGeoRecord | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function CustomGeoFormModal({
    open,
    record,
    onClose,
    onSaved
}: CustomGeoFormModalProps)
{
    const { t } = useTranslation();
    const [messageApi] = message.useMessage();
    const [type, setType] = useState<'geosite' | 'geoip'>('geosite');
    const [alias, setAlias] = useState('');
    const [url, setUrl] = useState('');
    const [saving, setSaving] = useState(false);

    const editing = record != null;

    useEffect(() =>
    {
        if (!open)
        {
            return;
        }
        if (record)
        {
            setType(record.type);
            setAlias(record.alias);
            setUrl(record.url);
        }
        else
        {
            setType('geosite');
            setAlias('');
            setUrl('');
        }
    }, [open, record]);

    async function submit()
    {
        const validated = CustomGeoFormSchema.safeParse({ type, alias, url });
        if (!validated.success)
        {
            messageApi.error(t(validated.error.issues[0]?.message ?? 'somethingWentWrong'));
            return;
        }
        setSaving(true);
        try
        {
            const apiUrl = editing
                ? `/panel/api/custom-geo/update/${ record!.id }`
                : '/panel/api/custom-geo/add';
            const msg = await HttpUtil.post(apiUrl, validated.data);
            if (msg?.success)
            {
                onSaved();
                onClose();
            }
        }
        finally
        {
            setSaving(false);
        }
    }

    return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t('pages.index.customGeoModalEdit') : t('pages.index.customGeoModalAdd')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('close')}</Button>
          <Button loading={saving} onClick={submit}>{t('pages.index.customGeoModalSave')}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="geo-type">{t('pages.index.customGeoType')}</Label>
          <Select
            id="geo-type"
            value={type}
            disabled={editing}
            onChange={(v) => setType(v as 'geosite' | 'geoip')}
            options={[
                { value: 'geosite', label: 'geosite' },
                { value: 'geoip', label: 'geoip' }
            ]}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="geo-alias">{t('pages.index.customGeoAlias')}</Label>
          <Input
            id="geo-alias"
            value={alias}
            disabled={editing}
            placeholder={t('pages.index.customGeoAliasPlaceholder')}
            onChange={(e) => setAlias(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="geo-url">{t('pages.index.customGeoUrl')}</Label>
          <Input
            id="geo-url"
            value={url}
            placeholder="https://"
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
      </div>
    </Modal>
    );
}
