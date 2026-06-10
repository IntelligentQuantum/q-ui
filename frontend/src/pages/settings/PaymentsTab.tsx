import { useTranslation } from 'react-i18next';

import type { AllSetting } from '@/models/setting';
import { Input, PasswordInput, SettingListItem, Switch } from '@/components/ui';

interface PaymentsTabProps {
  allSetting: AllSetting;
  updateSetting: (patch: Partial<AllSetting>) => void;
}

// PaymentsTab configures the Plisio cryptocurrency gateway and the configurable
// crypto deposit bonus. The bonus applies only to crypto top-ups credited
// through Plisio (members & resellers) — admin manual balance changes and
// internal transfers never receive it; that rule is enforced on the backend.
export default function PaymentsTab({ allSetting, updateSetting }: PaymentsTabProps)
{
    const { t } = useTranslation();
    const clampPct = (v: string) => Math.max(0, Math.min(100, Number(v) || 0));
    const clampNonNeg = (v: string) => Math.max(0, Number(v) || 0);

    return (
    <>
      {/* --- Plisio crypto gateway --- */}
      <SettingListItem
        paddings="small"
        title={t('pages.settings.payments.plisioEnable')}
        description={t('pages.settings.payments.plisioEnableDesc')}
      >
        <Switch
          checked={allSetting.plisioEnable}
          onCheckedChange={(checked) => updateSetting({ plisioEnable: checked })}
        />
      </SettingListItem>

      <SettingListItem
        paddings="small"
        title={t('pages.settings.payments.plisioSecretKey')}
        description={
            allSetting.hasPlisioSecretKey
                ? t('pages.settings.payments.plisioSecretKeyConfigured')
                : t('pages.settings.payments.plisioSecretKeyDesc')
        }
      >
        <PasswordInput
          className="max-w-[340px]"
          value={allSetting.plisioSecretKey}
          placeholder={allSetting.hasPlisioSecretKey ? '••••••••••••••••' : ''}
          onChange={(e) => updateSetting({ plisioSecretKey: e.target.value })}
        />
      </SettingListItem>

      <SettingListItem
        paddings="small"
        title={t('pages.settings.payments.plisioSourceCurrency')}
        description={t('pages.settings.payments.plisioSourceCurrencyDesc')}
      >
        <Input
          className="w-36"
          value={allSetting.plisioSourceCurrency}
          placeholder="USD"
          onChange={(e) => updateSetting({ plisioSourceCurrency: e.target.value.toUpperCase() })}
        />
      </SettingListItem>

      <SettingListItem
        paddings="small"
        title={t('pages.settings.payments.cryptoExchangeRate')}
        description={t('pages.settings.payments.cryptoExchangeRateDesc', { currency: allSetting.plisioSourceCurrency || 'USD' })}
      >
        <Input
          type="number"
          min={1}
          className="w-40"
          value={allSetting.cryptoExchangeRate}
          onChange={(e) => updateSetting({ cryptoExchangeRate: Math.max(1, Number(e.target.value) || 1) })}
        />
      </SettingListItem>

      {/* --- Crypto deposit bonus --- */}
      <SettingListItem
        paddings="small"
        title={t('pages.settings.payments.cryptoBonusEnabled')}
        description={t('pages.settings.payments.cryptoBonusEnabledDesc')}
      >
        <Switch
          checked={allSetting.cryptoBonusEnabled}
          onCheckedChange={(checked) => updateSetting({ cryptoBonusEnabled: checked })}
        />
      </SettingListItem>

      <SettingListItem
        paddings="small"
        title={t('pages.settings.payments.cryptoBonusPercent')}
        description={t('pages.settings.payments.cryptoBonusPercentDesc')}
      >
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={100}
            className="w-28"
            value={allSetting.cryptoBonusPercent}
            onChange={(e) => updateSetting({ cryptoBonusPercent: clampPct(e.target.value) })}
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
      </SettingListItem>

      <SettingListItem
        paddings="small"
        title={t('pages.settings.payments.cryptoBonusMinDeposit')}
        description={t('pages.settings.payments.cryptoBonusMinDepositDesc')}
      >
        <Input
          type="number"
          min={0}
          className="w-36"
          value={allSetting.cryptoBonusMinDeposit}
          onChange={(e) => updateSetting({ cryptoBonusMinDeposit: clampNonNeg(e.target.value) })}
        />
      </SettingListItem>

      <SettingListItem
        paddings="small"
        title={t('pages.settings.payments.cryptoBonusMax')}
        description={t('pages.settings.payments.cryptoBonusMaxDesc')}
      >
        <Input
          type="number"
          min={0}
          className="w-36"
          value={allSetting.cryptoBonusMax}
          onChange={(e) => updateSetting({ cryptoBonusMax: clampNonNeg(e.target.value) })}
        />
      </SettingListItem>
    </>
    );
}
