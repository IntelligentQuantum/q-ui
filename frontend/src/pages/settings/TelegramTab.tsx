import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingRow } from '@/components/ui';
import { Bell, Settings } from 'lucide-react';

import { LanguageManager, HttpUtil } from '@/utils';
import type { AllSetting } from '@/models/setting';
import {
    Alert,
    Button,
    EventBusCheckboxes,
    Input,
    PasswordInput,
    Select,
    Switch,
    Tabs
} from '@/components/ui';

interface TelegramTabProps {
  allSetting: AllSetting;
  updateSetting: (patch: Partial<AllSetting>) => void;
}

// One labelled settings row: title + optional description on the start, control on the end.
export default function TelegramTab({ allSetting, updateSetting }: TelegramTabProps)
{
    const { t } = useTranslation();

    const [activeTab, setActiveTab] = useState('1');
    const [testLoading, setTestLoading] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null);

    async function handleTestTgBot()
    {
        setTestLoading(true);
        setTestResult(null);
        try
        {
            const res = await HttpUtil.post('/panel/setting/testTgBot') as { success?: boolean; msg?: string };
            setTestResult({ success: !!res?.success, msg: res?.msg || '' });
        }
        catch (e: unknown)
        {
            setTestResult({ success: false, msg: e instanceof Error ? e.message : t('pages.settings.requestFailed') });
        }
        finally
        {
            setTestLoading(false);
        }
    }

    const langOptions = useMemo(
        () => LanguageManager.supportedLanguages.map((l: { value: string; name: string; icon: string }) => ({
            value: l.value,
            label: (
        <span className="inline-flex items-center gap-1.5">
          <span role="img" aria-label={l.name}>{l.icon}</span>
          <span>{l.name}</span>
        </span>
            )
        })),
        []
    );

    return (
    <div className="flex flex-col gap-4">
      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        tabs={[
            { key: '1', label: t('pages.settings.panelSettings'), icon: <Settings className="h-4 w-4" /> },
            { key: '2', label: t('pages.settings.notifications'), icon: <Bell className="h-4 w-4" /> }
        ]}
      />

      {activeTab === '1' && (
        <div className="flex flex-col divide-y divide-border">
          <SettingRow title={t('pages.settings.telegramBotEnable')} description={t('pages.settings.telegramBotEnableDesc')}>
            <div className="flex lg:justify-end">
              <Switch checked={allSetting.tgBotEnable} onCheckedChange={(v) => updateSetting({ tgBotEnable: v })} />
            </div>
          </SettingRow>

          <SettingRow
            title={t('pages.settings.telegramToken')}
            description={allSetting.hasTgBotToken ? 'Configured; leave blank to keep current token.' : t('pages.settings.telegramTokenDesc')}
          >
            <PasswordInput
              value={allSetting.tgBotToken}
              placeholder={allSetting.hasTgBotToken ? 'Configured - enter a new token to replace' : ''}
              onChange={(e) => updateSetting({ tgBotToken: e.target.value })}
            />
          </SettingRow>

          <SettingRow title={t('pages.settings.telegramChatId')} description={t('pages.settings.telegramChatIdDesc')}>
            <Input value={allSetting.tgBotChatId} onChange={(e) => updateSetting({ tgBotChatId: e.target.value })} />
          </SettingRow>

          <SettingRow title={t('pages.settings.telegramBotLanguage')}>
            <Select
              value={allSetting.tgLang}
              onChange={(v) => updateSetting({ tgLang: v })}
              options={langOptions}
            />
          </SettingRow>

          <SettingRow title={t('pages.settings.telegramAPIServer')} description={t('pages.settings.telegramAPIServerDesc')}>
            <Input value={allSetting.tgBotAPIServer} placeholder="https://api.example.com"
              onChange={(e) => updateSetting({ tgBotAPIServer: e.target.value })} />
          </SettingRow>
          <div className="space-y-3 pt-4">
            <Button loading={testLoading} onClick={handleTestTgBot}>{t('pages.settings.testTgBot')}</Button>
            {testResult && (
              <Alert variant={testResult.success ? 'success' : 'danger'} title={testResult.msg} />
            )}
          </div>
        </div>
      )}

      {activeTab === '2' && (
        <div className="flex flex-col divide-y divide-border">
          <SettingRow title={t('pages.settings.telegramNotifyTime')} description={t('pages.settings.telegramNotifyTimeDesc')}>
            <Input value={allSetting.tgRunTime} onChange={(e) => updateSetting({ tgRunTime: e.target.value })} />
          </SettingRow>
          <SettingRow title={t('pages.settings.tgNotifyBackup')} description={t('pages.settings.tgNotifyBackupDesc')}>
            <div className="flex lg:justify-end">
              <Switch checked={allSetting.tgBotBackup} onCheckedChange={(v) => updateSetting({ tgBotBackup: v })} />
            </div>
          </SettingRow>
          <SettingRow title={t('pages.settings.tgNotifyLogin')} description={t('pages.settings.tgNotifyLoginDesc')}>
            <div className="flex lg:justify-end">
              <Switch checked={allSetting.tgBotLoginNotify} onCheckedChange={(v) => updateSetting({ tgBotLoginNotify: v })} />
            </div>
          </SettingRow>
          <SettingRow title={t('pages.settings.tgNotifyCpu')} description={t('pages.settings.tgNotifyCpuDesc')}>
            <Input type="number" min={0} max={100} value={allSetting.tgCpu}
              onChange={(e) => updateSetting({ tgCpu: Number(e.target.value) || 0 })} />
          </SettingRow>
          <SettingRow title={t('pages.settings.tgEventBusNotify')} description={t('pages.settings.tgEventBusNotifyDesc')}>
            <EventBusCheckboxes
              value={allSetting.tgEnabledEvents}
              onChange={(v) => updateSetting({ tgEnabledEvents: v })}
              extra={{ 'cpu.high': { key: 'tgCpu', value: allSetting.tgCpu } }}
              onExtraChange={(key, v) => updateSetting({ [key]: v } as Partial<AllSetting>)}
            />
          </SettingRow>
        </div>
      )}
    </div>
    );
}
