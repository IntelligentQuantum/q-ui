import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, Settings } from 'lucide-react';

import { Alert, Button, EventBusCheckboxes, Input, PasswordInput, Select, SettingRow, Switch, Tabs } from '@/components/ui';
import { HttpUtil } from '@/utils';
import type { AllSetting } from '@/models/setting';

interface EmailTabProps
{
    allSetting: AllSetting;
    updateSetting: (patch: Partial<AllSetting>) => void;
}

interface SmtpTestResult
{
    success: boolean;
    msg: string;
}

export default function EmailTab({ allSetting, updateSetting }: EmailTabProps)
{
    const { t } = useTranslation();
    const [testLoading, setTestLoading] = useState(false);
    const [testResult, setTestResult] = useState<SmtpTestResult | null>(null);
    const [activeTab, setActiveTab] = useState('1');

    async function handleTestSmtp()
    {
        setTestLoading(true);
        setTestResult(null);
        try
        {
            const res = await HttpUtil.post('/panel/setting/testSmtp') as SmtpTestResult;
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

    return (
        <div className="flex flex-col gap-4">
            <Tabs
                value={activeTab}
                onChange={setActiveTab}
                tabs={[
                    { key: '1', label: t('pages.settings.smtpSettings'), icon: <Settings className="h-4 w-4" /> },
                    { key: '2', label: t('pages.settings.emailNotifications'), icon: <Mail className="h-4 w-4" /> }
                ]}
            />
            {activeTab === '1' && (
                <div className="flex flex-col divide-y divide-border">
                    <SettingRow title={t('pages.settings.smtpEnable')} description={t('pages.settings.smtpEnableDesc')}>
                        <div className="flex lg:justify-end">
                            <Switch checked={allSetting.smtpEnable} onCheckedChange={(v) => updateSetting({ smtpEnable: v })} />
                        </div>
                    </SettingRow>
                    <SettingRow title={t('pages.settings.smtpHost')} description={t('pages.settings.smtpHostDesc')}>
                        <Input value={allSetting.smtpHost} placeholder="smtp.gmail.com" onChange={(e) => updateSetting({ smtpHost: e.target.value })} />
                    </SettingRow>
                    <SettingRow title={t('pages.settings.smtpPort')} description={t('pages.settings.smtpPortDesc')}>
                        <Input type="number" value={allSetting.smtpPort} min={1} max={65535} onChange={(e) => updateSetting({ smtpPort: Number(e.target.value) || 587 })} />
                    </SettingRow>
                    <SettingRow title={t('pages.settings.smtpUsername')} description={t('pages.settings.smtpUsernameDesc')}>
                        <Input value={allSetting.smtpUsername} placeholder="user@gmail.com" onChange={(e) => updateSetting({ smtpUsername: e.target.value })} />
                    </SettingRow>
                    <SettingRow title={t('pages.settings.smtpPassword')} description={allSetting.hasSmtpPassword ? t('pages.settings.smtpPasswordConfigured') : t('pages.settings.smtpPasswordDesc')}>
                        <PasswordInput value={allSetting.smtpPassword} onChange={(e) => updateSetting({ smtpPassword: e.target.value })} />
                    </SettingRow>
                    <SettingRow title={t('pages.settings.smtpTo')} description={t('pages.settings.smtpToDesc')}>
                        <Input value={allSetting.smtpTo} placeholder="admin@example.com, ops@example.com" onChange={(e) => updateSetting({ smtpTo: e.target.value })} />
                    </SettingRow>
                    <SettingRow title={t('pages.settings.smtpEncryption')} description={t('pages.settings.smtpEncryptionDesc')}>
                        <Select
                            value={allSetting.smtpEncryptionType}
                            onChange={(v) => updateSetting({ smtpEncryptionType: v })}
                            options={[
                                { value: 'none', label: t('pages.settings.smtpEncryptionNone') },
                                { value: 'starttls', label: t('pages.settings.smtpEncryptionStartTLS') },
                                { value: 'tls', label: t('pages.settings.smtpEncryptionTLS') }
                            ]}
                        />
                    </SettingRow>
                    <div className="space-y-3 pt-4">
                        <Button loading={testLoading} onClick={handleTestSmtp}>{t('pages.settings.testSmtp')}</Button>
                        {testResult && (
                            <Alert variant={testResult.success ? 'success' : 'danger'} title={testResult.msg} />
                        )}
                    </div>
                </div>
            )}
            {activeTab === '2' && (
                <div className="flex flex-col divide-y divide-border">
                    <SettingRow title={t('pages.settings.smtpEventBusNotify')} description={t('pages.settings.smtpEventBusNotifyDesc')}>
                        <EventBusCheckboxes
                            value={allSetting.smtpEnabledEvents}
                            onChange={(v) => updateSetting({ smtpEnabledEvents: v })}
                            extra={{ 'cpu.high': { key: 'smtpCpu', value: allSetting.smtpCpu } }}
                            onExtraChange={(key, v) => updateSetting({ [key]: v } as Partial<AllSetting>)}
                        />
                    </SettingRow>
                </div>
            )}
        </div>
    );
}
