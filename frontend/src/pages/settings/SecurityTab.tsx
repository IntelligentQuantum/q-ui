import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingRow } from '@/components/ui';
import { Lock, Plug, Shield, User } from 'lucide-react';
import { message } from '@/components/ui/message';

import { ClipboardManager, HttpUtil, RandomUtil } from '@/utils';
import type { AllSetting } from '@/models/setting';
import {
    Button,
    Input,
    Label,
    Modal,
    PasswordInput,
    Spinner,
    Switch,
    Tabs,
    confirm
} from '@/components/ui';
import TwoFactorModal from './TwoFactorModal';

interface ApiMsg<T = unknown> {
  success?: boolean;
  msg?: string;
  obj?: T;
}

interface ApiTokenRow {
  id: number;
  name: string;
  enabled: boolean;
  createdAt: number;
}

interface SecurityTabProps {
  allSetting: AllSetting;
  updateSetting: (patch: Partial<AllSetting>) => void;
}

type TfaType = 'set' | 'confirm';

interface TfaState {
  open: boolean;
  title: string;
  description: string;
  token: string;
  type: TfaType;
  onConfirm: (success: boolean, code?: string) => void;
}

const TFA_INITIAL: TfaState = {
    open: false,
    title: '',
    description: '',
    token: '',
    type: 'set',
    onConfirm: () =>
    {}
};

// One labelled settings row: title + optional description on the start, control on the end.
export default function SecurityTab({ allSetting, updateSetting }: SecurityTabProps)
{
    const { t } = useTranslation();
    const [messageApi] = message.useMessage();

    const [activeTab, setActiveTab] = useState('1');
    const [tfa, setTfa] = useState<TfaState>(TFA_INITIAL);
    const [user, setUser] = useState({
        oldUsername: '',
        oldPassword: '',
        newUsername: '',
        newPassword: ''
    });
    const [updating, setUpdating] = useState(false);

    const [apiTokens, setApiTokens] = useState<ApiTokenRow[]>([]);
    const [apiTokensLoading, setApiTokensLoading] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [createName, setCreateName] = useState('');
    const [creating, setCreating] = useState(false);
    const [createdToken, setCreatedToken] = useState<{ name: string; token: string } | null>(null);

    const openTfa = useCallback((opts: Omit<TfaState, 'open'>) =>
    {
        setTfa({ ...opts, open: true });
    }, []);

    const onTfaConfirm = useCallback((success: boolean, code?: string) =>
    {
        tfa.onConfirm(success, code);
    }, [tfa]);

    function updateUserField<K extends keyof typeof user>(key: K, value: string)
    {
        setUser((prev) => ({ ...prev, [key]: value }));
    }

    const sendUpdateUser = useCallback(async () =>
    {
        setUpdating(true);
        try
        {
            const msg = await HttpUtil.post('/panel/setting/updateUser', user) as ApiMsg;
            if (msg?.success)
            {
                await HttpUtil.post('/logout');
                const basePath = window.Q_UI_BASE_PATH || '/';
                window.location.replace(basePath);
            }
        }
        finally
        {
            setUpdating(false);
        }
    }, [user]);

    function onUpdateUserClick()
    {
        if (allSetting.twoFactorEnable)
        {
            openTfa({
                title: t('pages.settings.security.twoFactorModalChangeCredentialsTitle'),
                description: t('pages.settings.security.twoFactorModalChangeCredentialsStep'),
                token: allSetting.twoFactorToken,
                type: 'confirm',
                onConfirm: (ok: boolean) =>
                {
                    if (ok)
                    {
                        sendUpdateUser();
                    }
                }
            });
        }
        else
        {
            sendUpdateUser();
        }
    }

    const loadApiTokens = useCallback(async () =>
    {
        setApiTokensLoading(true);
        try
        {
            const msg = await HttpUtil.get('/panel/setting/apiTokens') as ApiMsg<ApiTokenRow[]>;
            if (msg?.success)
            {
                setApiTokens(Array.isArray(msg.obj) ? msg.obj : []);
            }
        }
        finally
        {
            setApiTokensLoading(false);
        }
    }, []);

    useEffect(() =>
    {

        loadApiTokens();
    }, [loadApiTokens]);

    async function copyToken(token: string)
    {
        if (!token)
        {
            return;
        }
        const ok = await ClipboardManager.copyText(token);
        if (ok)
        {
            messageApi.success(t('copySuccess'));
        }
        else
        {
            messageApi.error(t('copyFail') ?? 'Copy failed');
        }
    }

    function openCreateModal()
    {
        setCreateName('');
        setCreateOpen(true);
    }

    async function confirmCreateToken()
    {
        const name = createName.trim();
        if (!name)
        {
            messageApi.error(t('pages.settings.security.apiTokenNameRequired') || 'Name is required');
            return;
        }
        setCreating(true);
        try
        {
            const msg = await HttpUtil.post('/panel/setting/apiTokens/create', { name }) as ApiMsg<{ token?: string }>;
            if (msg?.success)
            {
                setCreateOpen(false);
                await loadApiTokens();
                if (msg.obj?.token)
                {
                    setCreatedToken({ name, token: msg.obj.token });
                }
            }
        }
        finally
        {
            setCreating(false);
        }
    }

    async function confirmDeleteToken(row: ApiTokenRow)
    {
        const ok = await confirm({
            title: `${ t('delete') } "${ row.name }"?`,
            description: t('pages.settings.security.apiTokenDeleteWarning')
        || 'Any caller using this token will stop authenticating immediately.',
            confirmText: t('delete'),
            cancelText: t('cancel'),
            danger: true
        });
        if (!ok)
        {
            return;
        }
        const msg = await HttpUtil.post(`/panel/setting/apiTokens/delete/${ row.id }`) as ApiMsg;
        if (msg?.success)
        {
            await loadApiTokens();
        }
    }

    async function toggleTokenEnabled(row: ApiTokenRow)
    {
        const target = !row.enabled;
        const msg = await HttpUtil.post(`/panel/setting/apiTokens/setEnabled/${ row.id }`, { enabled: target }) as ApiMsg;
        if (msg?.success)
        {
            setApiTokens((prev) => prev.map((r) => (r.id === row.id ? { ...r, enabled: target } : r)));
        }
    }

    function formatTokenDate(ts: number): string
    {
        if (!ts)
        {
            return '';
        }
        return new Date(ts * 1000).toLocaleString();
    }

    function toggleTwoFactor()
    {
        if (!allSetting.twoFactorEnable)
        {
            const newToken = RandomUtil.randomBase32String();
            openTfa({
                title: t('pages.settings.security.twoFactorModalSetTitle'),
                description: '',
                token: newToken,
                type: 'set',
                onConfirm: (ok: boolean) =>
                {
                    if (ok)
                    {
                        messageApi.success(t('pages.settings.security.twoFactorModalSetSuccess'));
                        updateSetting({ twoFactorToken: newToken, twoFactorEnable: true });
                    }
                    else
                    {
                        updateSetting({ twoFactorEnable: false });
                    }
                }
            });
        }
        else
        {
            openTfa({
                title: t('pages.settings.security.twoFactorModalDeleteTitle'),
                description: t('pages.settings.security.twoFactorModalRemoveStep'),
                token: allSetting.twoFactorToken,
                type: 'confirm',
                onConfirm: (ok: boolean) =>
                {
                    if (!ok)
                    {
                        return;
                    }
                    messageApi.success(t('pages.settings.security.twoFactorModalDeleteSuccess'));
                    updateSetting({ twoFactorEnable: false, twoFactorToken: '' });
                }
            });
        }
    }

    return (
    <>
      <div className="flex flex-col gap-4">
        <Tabs
          value={activeTab}
          onChange={setActiveTab}
          tabs={[
              { key: '1', label: t('pages.settings.security.admin'), icon: <User className="h-4 w-4" /> },
              { key: '2', label: t('pages.settings.security.twoFactor'), icon: <Shield className="h-4 w-4" /> },
              { key: '3', label: t('pages.nodes.apiToken'), icon: <Plug className="h-4 w-4" /> }
          ]}
        />

        {activeTab === '1' && (
          <div className="flex flex-col divide-y divide-border">
            <SettingRow title={t('pages.settings.oldUsername')} htmlFor="sec-old-username">
              <Input
                id="sec-old-username"
                value={user.oldUsername}
                autoComplete="username"
                startIcon={<User aria-hidden />}
                onChange={(e) => updateUserField('oldUsername', e.target.value)}
              />
            </SettingRow>
            <SettingRow title={t('pages.settings.currentPassword')} htmlFor="sec-old-password">
              <PasswordInput
                id="sec-old-password"
                value={user.oldPassword}
                autoComplete="current-password"
                startIcon={<Lock aria-hidden />}
                onChange={(e) => updateUserField('oldPassword', e.target.value)}
              />
            </SettingRow>
            <SettingRow title={t('pages.settings.newUsername')} htmlFor="sec-new-username">
              <Input
                id="sec-new-username"
                value={user.newUsername}
                startIcon={<User aria-hidden />}
                onChange={(e) => updateUserField('newUsername', e.target.value)}
              />
            </SettingRow>
            <SettingRow title={t('pages.settings.newPassword')} htmlFor="sec-new-password">
              <PasswordInput
                id="sec-new-password"
                value={user.newPassword}
                autoComplete="new-password"
                startIcon={<Lock aria-hidden />}
                onChange={(e) => updateUserField('newPassword', e.target.value)}
              />
            </SettingRow>
            <div className="pt-4">
              <Button loading={updating} onClick={onUpdateUserClick}>
                {t('confirm')}
              </Button>
            </div>
          </div>
        )}

        {activeTab === '2' && (
          <div className="flex flex-col divide-y divide-border">
            <SettingRow
              title={t('pages.settings.security.twoFactorEnable')}
              description={t('pages.settings.security.twoFactorEnableDesc')}
            >
              <div className="flex lg:justify-end">
                <Switch checked={allSetting.twoFactorEnable} onCheckedChange={toggleTwoFactor} />
              </div>
            </SettingRow>
            <SettingRow
              title={t('pages.settings.security.registrationEnable')}
              description={t('pages.settings.security.registrationEnableDesc')}
            >
              <div className="flex lg:justify-end">
                <Switch
                  checked={allSetting.registrationEnable}
                  onCheckedChange={(checked) => updateSetting({ registrationEnable: checked })}
                />
              </div>
            </SettingRow>
          </div>
        )}

        {activeTab === '3' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">{t('pages.nodes.apiTokenHint')}</p>
              <Button size="sm" onClick={openCreateModal}>
                + {t('pages.settings.security.apiTokenNew') || 'New token'}
              </Button>
            </div>

            {apiTokensLoading ? (
              <div className="flex justify-center py-8">
                <Spinner className="h-6 w-6" />
              </div>
            ) : apiTokens.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                {t('pages.settings.security.apiTokenEmpty') || 'No tokens yet'}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {apiTokens.map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className={`truncate text-sm font-medium ${ row.enabled ? 'text-foreground' : 'text-muted-foreground' }`}>
                        {row.name}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatTokenDate(row.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch checked={row.enabled} onCheckedChange={() => toggleTokenEnabled(row)} />
                      <Button size="sm" variant="danger" onClick={() => confirmDeleteToken(row)}>
                        {t('delete')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('pages.settings.security.apiTokenNew') || 'New API token'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              {t('cancel')}
            </Button>
            <Button loading={creating} onClick={confirmCreateToken}>
              {t('confirm')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="api-token-name">
            {t('pages.settings.security.apiTokenName') || 'Name'}
          </Label>
          <Input
            id="api-token-name"
            value={createName}
            maxLength={64}
            placeholder={t('pages.settings.security.apiTokenNamePlaceholder') || 'e.g. central-panel-a'}
            onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) =>
            {
                if (e.key === 'Enter')
                {
                    e.preventDefault();
                    confirmCreateToken();
                }
            }}
          />
        </div>
      </Modal>

      <Modal
        open={!!createdToken}
        onClose={() => setCreatedToken(null)}
        title={t('pages.settings.security.apiTokenCreatedTitle') || 'Token created'}
        size="md"
        footer={
          <Button onClick={() => setCreatedToken(null)}>{t('done')}</Button>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {t('pages.settings.security.apiTokenCreatedNotice')
              || 'Copy this token now. For security it is not stored in readable form and will not be shown again.'}
          </p>
          <div className="flex items-center gap-2 rounded-md border border-border bg-surface-sunken p-2">
            <code className="min-w-0 flex-1 break-all font-mono text-xs text-foreground">{createdToken?.token}</code>
            <Button size="sm" onClick={() => createdToken && copyToken(createdToken.token)}>
              {t('copy')}
            </Button>
          </div>
        </div>
      </Modal>

      <TwoFactorModal
        open={tfa.open}
        title={tfa.title}
        description={tfa.description}
        token={tfa.token}
        type={tfa.type}
        onConfirm={onTfaConfirm}
        onOpenChange={(open) => setTfa((prev) => ({ ...prev, open }))}
      />
    </>
    );
}
