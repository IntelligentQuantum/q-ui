import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import {
    Pencil,
    QrCode,
    Copy,
    Upload,
    Repeat,
    CopyPlus,
    Trash2,
    Info,
    Tags,
    UserRoundPlus,
    UserRoundMinus
} from 'lucide-react';

import { Button, DropdownMenu, type DropdownItem } from '@/components/ui';

import { isInboundMultiUser, showQrCodeMenu } from './helpers';
import type { DBInboundRecord, RowAction } from './types';

interface RowActionsMenuProps {
  record: DBInboundRecord;
  subEnable: boolean;
  hasClients: boolean;
  onClick: (key: RowAction) => void;
  isMobile?: boolean;
}

const ICON = 'h-4 w-4';

export function buildRowActionsItems({
    record,
    subEnable,
    t,
    isMobile,
    hasClients,
    onClick
}: {
  record: DBInboundRecord;
  subEnable: boolean;
  t: (k: string) => string;
  isMobile?: boolean;
  hasClients?: boolean;
  onClick: (key: RowAction) => void;
}): DropdownItem[]
{
    const items: DropdownItem[] = [];
    const add = (key: string, icon: ReactNode, label: string, danger?: boolean) =>
        items.push({ key, icon, label, danger, onSelect: () => onClick(key as RowAction) });

    if (isMobile)
    {
        add('edit', <Pencil className={ICON} />, t('edit'));
    }
    if (showQrCodeMenu(record))
    {
        add('qrcode', <QrCode className={ICON} />, t('qrCode'));
    }
    if (isInboundMultiUser(record))
    {
        add('export', <Upload className={ICON} />, t('pages.inbounds.export'));
        if (subEnable)
        {
            add('subs', <Upload className={ICON} />, `${ t('pages.inbounds.export') } — ${ t('pages.settings.subSettings') }`);
        }
    }
    else
    {
        add('showInfo', <Info className={ICON} />, t('pages.inbounds.inboundInfo'));
    }
    add('clipboard', <Copy className={ICON} />, t('pages.inbounds.exportInbound'));
    add('resetTraffic', <Repeat className={ICON} />, t('pages.inbounds.resetTraffic'));
    add('clone', <CopyPlus className={ICON} />, t('pages.inbounds.clone'));
    if (isInboundMultiUser(record))
    {
        add('attachExisting', <UserRoundPlus className={ICON} />, t('pages.inbounds.attachExistingClients'));
    }
    if (isInboundMultiUser(record) && hasClients)
    {
        add('attachClients', <UserRoundPlus className={ICON} />, t('pages.inbounds.attachClients'));
        add('detachClients', <UserRoundMinus className={ICON} />, t('pages.inbounds.detachClients'));
        add('addToGroup', <Tags className={ICON} />, t('pages.inbounds.addClientsToGroup'));
        items.push({ type: 'separator' });
        add('delAllClients', <UserRoundMinus className={ICON} />, t('pages.inbounds.delAllClients'), true);
    }
    else
    {
        items.push({ type: 'separator' });
    }
    add('delete', <Trash2 className={ICON} />, t('delete'), true);
    return items;
}

export function RowActionsCell({ record, subEnable, hasClients, onClick }: RowActionsMenuProps)
{
    const { t } = useTranslation();
    return (
    <div className="flex items-center justify-center gap-1">
      <Button
        aria-label={t('edit')}
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => onClick('edit')}
      >
        <Pencil className={ICON} aria-hidden />
      </Button>
      <DropdownMenu
        label={t('more')}
        items={buildRowActionsItems({ record, subEnable, t, hasClients, onClick })}
      />
    </div>
    );
}
