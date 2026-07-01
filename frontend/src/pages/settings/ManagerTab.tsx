import { useTranslation } from 'react-i18next';

import type { AllSetting } from '@/models/setting';
import { Input, SettingListItem } from '@/components/ui';

interface ManagerTabProps {
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
  managerKey: CostKey;
  memberKey: CostKey;
  allSetting: AllSetting;
  updateSetting: (patch: Partial<AllSetting>) => void;
}

// RoleCostRow renders one cost with a separate input per chargeable tier
// (manager / member). Admins are always free, so they have no input. The
// "manager" tier is the admin's price for their direct partners; resellers in
// the global scope fall back to the member rate (managers price their own
// resellers via per-tenant settings). The underlying setting keys keep their
// historical "*Reseller" names; only the presentation is the Manager tier.
function RoleCostRow({ title, description, managerKey, memberKey, allSetting, updateSetting }: RoleCostRowProps)
{
    const { t } = useTranslation();
    return (
    <SettingListItem paddings="small" title={title} description={description}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('pages.settings.security.roleManager')}</span>
          <Input
            type="number"
            min={0}
            className="w-28"
            value={allSetting[managerKey] as number}
            onChange={(e) => updateSetting({ [managerKey]: Number(e.target.value) || 0 } as Partial<AllSetting>)}
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

// ManagerTab groups the manager economy controls — what creating a client and
// resetting its traffic costs, priced per tier (admins are always free), and
// the referral commission. Payment-gateway settings (ZarinPal, Plisio, manual
// deposit) live under their own Payments / Manual Deposit tabs.
export default function ManagerTab({ allSetting, updateSetting }: ManagerTabProps)
{
    const { t } = useTranslation();

    return (
    <>
      <RoleCostRow
        title={t('pages.settings.security.clientCost')}
        description={t('pages.settings.security.clientCostDesc')}
        managerKey="clientCostReseller"
        memberKey="clientCostMember"
        allSetting={allSetting}
        updateSetting={updateSetting}
      />

      <RoleCostRow
        title={t('pages.settings.security.clientCostPerGB')}
        description={t('pages.settings.security.clientCostPerGBDesc')}
        managerKey="clientCostPerGBReseller"
        memberKey="clientCostPerGBMember"
        allSetting={allSetting}
        updateSetting={updateSetting}
      />

      <RoleCostRow
        title={t('pages.settings.security.resetTrafficCost')}
        description={t('pages.settings.security.resetTrafficCostDesc')}
        managerKey="resetTrafficCostReseller"
        memberKey="resetTrafficCostMember"
        allSetting={allSetting}
        updateSetting={updateSetting}
      />

      <RoleCostRow
        title={t('pages.settings.security.resetTrafficCostPerGB')}
        description={t('pages.settings.security.resetTrafficCostPerGBDesc')}
        managerKey="resetTrafficCostPerGBReseller"
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
    </>
    );
}
