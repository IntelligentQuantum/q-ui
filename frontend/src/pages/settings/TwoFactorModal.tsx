import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCode } from '@/components/ui';
import { message } from '@/components/ui/message';
import * as OTPAuth from 'otpauth';

import { ClipboardManager } from '@/utils';
import { TotpCodeSchema } from '@/schemas/login';
import { Button, Input, Modal } from '@/components/ui';

type Type = 'set' | 'confirm';

interface TwoFactorModalProps {
  open: boolean;
  title?: string;
  description?: string;
  token?: string;
  type?: Type;
  onConfirm: (success: boolean, code?: string) => void;
  onOpenChange: (open: boolean) => void;
}

export default function TwoFactorModal({
    open,
    title = '',
    description = '',
    token = '',
    type = 'set',
    onConfirm,
    onOpenChange
}: TwoFactorModalProps)
{
    const { t } = useTranslation();
    const [messageApi, messageContextHolder] = message.useMessage();
    const [enteredCode, setEnteredCode] = useState('');
    const [qrValue, setQrValue] = useState('');
    const totpRef = useRef<OTPAuth.TOTP | null>(null);

    useEffect(() =>
    {
        if (!open)
        {
            return;
        }

        setEnteredCode('');
        totpRef.current = null;
        setQrValue('');
        if (token)
        {
            const totp = new OTPAuth.TOTP({
                issuer: 'Q-UI',
                label: 'Administrator',
                algorithm: 'SHA1',
                digits: 6,
                period: 30,
                secret: token
            });
            totpRef.current = totp;
            setQrValue(totp.toString());
        }

    }, [open, token]);

    function close(success: boolean, code = '')
    {
        onConfirm(success, code);
        onOpenChange(false);
        setEnteredCode('');
    }

    function onOk()
    {
        const codeOk = TotpCodeSchema.safeParse(enteredCode);
        if (!codeOk.success)
        {
            messageApi.error(t(codeOk.error.issues[0]?.message ?? 'pages.settings.security.twoFactorModalError'));
            return;
        }
        if (type === 'confirm' && !token)
        {
            close(true, codeOk.data);
            return;
        }
        if (!totpRef.current)
        {
            return;
        }
        if (totpRef.current.generate() === codeOk.data)
        {
            close(true);
        }
        else
        {
            messageApi.error(t('pages.settings.security.twoFactorModalError'));
        }
    }

    function onCancel()
    {
        close(false);
    }

    async function copyToken()
    {
        const ok = await ClipboardManager.copyText(token);
        if (ok)
        {
            messageApi.success(t('copied'));
        }
    }

    return (
    <>
      {messageContextHolder}
      <Modal
        open={open}
        onClose={onCancel}
        title={title}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={onCancel}>
              {t('cancel')}
            </Button>
            <Button
              disabled={!TotpCodeSchema.safeParse(enteredCode).success}
              onClick={onOk}
            >
              {t('confirm')}
            </Button>
          </>
        }
      >
        {type === 'set' ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-foreground">{t('pages.settings.security.twoFactorModalSteps')}</p>
            <div className="border-t border-border" />
            <p className="text-sm text-foreground">{t('pages.settings.security.twoFactorModalFirstStep')}</p>
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={copyToken}
                title={t('copy')}
                className="rounded-lg bg-white p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <QRCode value={qrValue} size={180} errorLevel="L" />
              </button>
              <span className="break-all text-center text-xs text-muted-foreground">{token}</span>
            </div>
            <div className="border-t border-border" />
            <p className="text-sm text-foreground">{t('pages.settings.security.twoFactorModalSecondStep')}</p>
            <Input value={enteredCode} onChange={(e) => setEnteredCode(e.target.value)} />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-foreground">{description}</p>
            <Input value={enteredCode} onChange={(e) => setEnteredCode(e.target.value)} />
          </div>
        )}
      </Modal>
    </>
    );
}
