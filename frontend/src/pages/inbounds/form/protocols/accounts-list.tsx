import { useTranslation } from 'react-i18next';
import { Plus, Minus } from 'lucide-react';

import { RandomUtil } from '@/utils';
import { Button, Input, Label } from '@/components/ui';
import { useFieldArray, useFormContext } from '@/components/form/rhf';

export default function AccountsList()
{
    const { t } = useTranslation();
    const { control, register } = useFormContext();
    const { fields, append, remove } = useFieldArray({ control, name: 'settings.accounts' });
    return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Label>{t('pages.inbounds.form.accounts')}</Label>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
              append({ user: RandomUtil.randomLowerAndNum(8), pass: RandomUtil.randomLowerAndNum(12) })
          }
        >
          <Plus className="h-4 w-4" />
          {t('add')}
        </Button>
      </div>
      {fields.map((field, i) => (
        <div key={field.id} className="flex items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-surface-sunken text-xs text-muted-foreground">
            {i + 1}
          </span>
          <Input className="flex-1" placeholder={t('username')} {...register(`settings.accounts.${ i }.user`)} />
          <Input className="flex-1" placeholder={t('password')} {...register(`settings.accounts.${ i }.pass`)} />
          <Button variant="ghost" size="icon" aria-label={t('delete')} onClick={() => remove(i)}>
            <Minus className="h-4 w-4 text-danger" />
          </Button>
        </div>
      ))}
    </div>
    );
}
