import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useMe } from '@/hooks/useMe';

/**
 * useCurrency centralizes how wallet amounts are rendered. The balance is held
 * as integer credits where 1 credit == 1 currency unit; this formats it with
 * thousand separators and the localized unit word (Toman / Rial) so users
 * actually understand what the number means.
 */
export function useCurrency()
{
    const { me } = useMe();
    const { t } = useTranslation();

    const code = me?.currency || 'IRT';
    const unit = useMemo(() => t(`currency.${ code }`, { defaultValue: code }), [t, code]);

    const formatNumber = useCallback((amount: number) => new Intl.NumberFormat().format(Math.round(amount || 0)), []);

    // "135,000 Toman"
    const format = useCallback(
        (amount: number) => `${ formatNumber(amount) } ${ unit }`,
        [formatNumber, unit]
    );

    return { format, formatNumber, unit, code, clientCost: me?.clientCost ?? 0, clientCostPerGB: me?.clientCostPerGB ?? 0 };
}
