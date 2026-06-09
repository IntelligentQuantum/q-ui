import { useTranslation } from 'react-i18next';

import type { AllSetting } from '@/models/setting';
import { Input, Select, SettingListItem, Switch } from '@/components/ui';

interface ResellerTabProps {
  allSetting: AllSetting;
  updateSetting: (patch: Partial<AllSetting>) => void;
}

// Numeric AllSetting keys that hold a per-role credit amount.
type CostKey = {
  [K in keyof AllSetting]: AllSetting[K] extends number ? K : never;
}[keyof AllSetting];

interface RoleCostRowProps {
  title: string;
  description: string;
  resellerKey: CostKey;
  memberKey: CostKey;
  allSetting: AllSetting;
  updateSetting: (patch: Partial<AllSetting>) => void;
}

// RoleCostRow renders one cost with a separate input per chargeable role
// (reseller / member). Admins are always free, so they have no input.
function RoleCostRow({ title, description, resellerKey, memberKey, allSetting, updateSetting }: RoleCostRowProps)
{
    const { t } = useTranslation();
    return (
    <SettingListItem paddings="small" title={title} description={description}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('pages.settings.security.roleReseller')}</span>
          <Input
            type="number"
            min={0}
            className="w-28"
            value={allSetting[resellerKey] as number}
            onChange={(e) => updateSetting({ [resellerKey]: Number(e.target.value) || 0 } as Partial<AllSetting>)}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('pages.settings.security.roleMember')}</span>
          <Input
            type="number"
            min={0}
            className="w-28"
            value={allSetting[memberKey] as number}
            onChange={(e) => updateSetting({ [memberKey]: Number(e.target.value) || 0 } as Partial<AllSetting>)}
          />
        </div>
      </div>
    </SettingListItem>
    );
}

// ResellerTab groups the reseller economy controls — what creating a client and
// resetting its traffic costs, priced per role (admins are always free), and the
// ZarinPal gateway used to top up balances.
export default function ResellerTab({ allSetting, updateSetting }: ResellerTabProps)
{
    const { t } = useTranslation();

    return (
    <>
      <RoleCostRow
        title={t('pages.settings.security.clientCost')}
        description={t('pages.settings.security.clientCostDesc')}
        resellerKey="clientCostReseller"
        memberKey="clientCostMember"
        allSetting={allSetting}
        updateSetting={updateSetting}
      />

      <RoleCostRow
        title={t('pages.settings.security.clientCostPerGB')}
        description={t('pages.settings.security.clientCostPerGBDesc')}
        resellerKey="clientCostPerGBReseller"
        memberKey="clientCostPerGBMember"
        allSetting={allSetting}
        updateSetting={updateSetting}
      />

      <RoleCostRow
        title={t('pages.settings.security.resetTrafficCost')}
        description={t('pages.settings.security.resetTrafficCostDesc')}
        resellerKey="resetTrafficCostReseller"
        memberKey="resetTrafficCostMember"
        allSetting={allSetting}
        updateSetting={updateSetting}
      />

      <RoleCostRow
        title={t('pages.settings.security.resetTrafficCostPerGB')}
        description={t('pages.settings.security.resetTrafficCostPerGBDesc')}
        resellerKey="resetTrafficCostPerGBReseller"
        memberKey="resetTrafficCostPerGBMember"
        allSetting={allSetting}
        updateSetting={updateSetting}
      />

      <SettingListItem
        paddings="small"
        title={t('pages.settings.security.referralCommission', { defaultValue: 'Referral commission' })}
        description={t('pages.settings.security.referralCommissionDesc', {
            defaultValue: 'Percentage of a referred user’s store purchase credited to the referring reseller’s wallet. 0 disables payouts.'
        })}
      >
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={100}
            className="w-28"
            value={allSetting.referralCommissionPercent}
            onChange={(e) =>
            {
                const n = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                updateSetting({ referralCommissionPercent: n });
            }}
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
      </SettingListItem>

      <SettingListItem
        paddings="small"
        title={t('pages.settings.security.zarinpalEnable')}
        description={t('pages.settings.security.zarinpalEnableDesc')}
      >
        <Switch
          checked={allSetting.zarinpalEnable}
          onCheckedChange={(checked) => updateSetting({ zarinpalEnable: checked })}
        />
      </SettingListItem>

      <SettingListItem
        paddings="small"
        title={t('pages.settings.security.zarinpalMerchantId')}
        description={t('pages.settings.security.zarinpalMerchantIdDesc')}
      >
        <Input
          className="max-w-[340px]"
          value={allSetting.zarinpalMerchantId}
          onChange={(e) => updateSetting({ zarinpalMerchantId: e.target.value })}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        />
      </SettingListItem>

      <SettingListItem
        paddings="small"
        title={t('pages.settings.security.zarinpalCurrency')}
        description={t('pages.settings.security.zarinpalCurrencyDesc')}
      >
        <Select
          className="w-36"
          value={allSetting.zarinpalCurrency || 'IRT'}
          onChange={(value) => updateSetting({ zarinpalCurrency: value })}
          options={[
              { value: 'IRT', label: 'IRT (Toman)' },
              { value: 'IRR', label: 'IRR (Rial)' }
          ]}
        />
      </SettingListItem>

      <SettingListItem
        paddings="small"
        title={t('pages.settings.security.zarinpalSandbox')}
        description={t('pages.settings.security.zarinpalSandboxDesc')}
      >
        <Switch
          checked={allSetting.zarinpalSandbox}
          onCheckedChange={(checked) => updateSetting({ zarinpalSandbox: checked })}
        />
      </SettingListItem>
    </>
    );
}
