import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Trash2 } from 'lucide-react';

import { DropdownMenu, Input } from '@/components/ui';
import type { Column } from '@/components/ui';
import { addrFor, domainsFor, expectedIPsFor } from './helpers';
import type { DnsServerValue } from './DnsServerModal';

export interface DnsServerRow { key: number; server: DnsServerValue }
export interface FakednsTableRow { key: number; ipPool: string; poolSize: number }

export function useDnsServerColumns({
    openEditServer,
    deleteServer
}: {
  openEditServer: (idx: number) => void;
  deleteServer: (idx: number) => void;
}): Column<DnsServerRow>[]
{
    const { t } = useTranslation();
    return useMemo(
        () => [
            {
                key: 'action',
                header: '#',
                align: 'center',
                width: 80,
                cell: (row) => (
          <div className="flex items-center justify-center gap-1.5">
            <span className="font-medium text-muted-foreground">{row.key + 1}</span>
            <DropdownMenu
              align="end"
              label={t('more')}
              items={[
                  {
                      key: 'edit',
                      label: t('edit'),
                      icon: <Pencil className="h-4 w-4" aria-hidden />,
                      onSelect: () => openEditServer(row.key)
                  },
                  {
                      key: 'del',
                      danger: true,
                      label: t('delete'),
                      icon: <Trash2 className="h-4 w-4" aria-hidden />,
                      onSelect: () => deleteServer(row.key)
                  }
              ]}
            />
          </div>
                )
            },
            {
                key: 'address',
                header: t('pages.inbounds.address'),
                align: 'start',
                cell: (row) => addrFor(row.server)
            },
            {
                key: 'domains',
                header: t('pages.xray.dns.domains'),
                align: 'start',
                cell: (row) => <span className="break-all text-muted-foreground">{domainsFor(row.server)}</span>
            },
            {
                key: 'expectedIPs',
                header: t('pages.xray.dns.expectIPs'),
                align: 'start',
                cell: (row) => <span className="break-all text-muted-foreground">{expectedIPsFor(row.server)}</span>
            }
        ],
        [t]
    );
}

export function useFakednsColumns({
    deleteFakedns,
    updateFakednsField
}: {
  deleteFakedns: (idx: number) => void;
  updateFakednsField: (idx: number, field: 'ipPool' | 'poolSize', value: string | number) => void;
}): Column<FakednsTableRow>[]
{
    const { t } = useTranslation();
    return useMemo(
        () => [
            {
                key: 'action',
                header: '#',
                align: 'center',
                width: 80,
                cell: (row) => (
          <div className="flex items-center justify-center gap-1.5">
            <span className="font-medium text-muted-foreground">{row.key + 1}</span>
            <button
              type="button"
              aria-label={t('delete')}
              onClick={() => deleteFakedns(row.key)}
              className="grid h-8 w-8 place-items-center rounded-md text-danger outline-none transition-colors hover:bg-danger-subtle focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </div>
                )
            },
            {
                key: 'ipPool',
                header: 'IP pool',
                align: 'start',
                cell: (row) => (
          <Input
            value={row.ipPool}
            onChange={(e) => updateFakednsField(row.key, 'ipPool', e.target.value)}
          />
                )
            },
            {
                key: 'poolSize',
                header: 'Pool size',
                align: 'end',
                width: 140,
                cell: (row) => (
          <Input
            type="number"
            min={1}
            value={row.poolSize}
            className="text-end"
            onChange={(e) => updateFakednsField(row.key, 'poolSize', Number(e.target.value) || 0)}
          />
                )
            }
        ],
        [t]
    );
}
