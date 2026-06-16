import { useQuery } from '@tanstack/react-query';

import { HttpUtil } from '@/utils';

// Fetch the outbound tags from the live Xray config so the node form can pick
// which egress outbound a node's bridge routes its panel API traffic through.
// Mirrors fetchXrayConfig in useXraySetting: POST /panel/xray/ returns the
// config as a JSON string in `obj`. Blackhole outbounds are excluded since
// routing a node through a blackhole would just drop its traffic.
export function useOutboundTags()
{
    return useQuery({
        queryKey: ['xray', 'outboundTags'],
        staleTime: 60_000,
        queryFn: async (): Promise<string[]> =>
        {
            const msg = await HttpUtil.post('/panel/xray/', undefined, { silent: true });
            if (!msg?.success || typeof msg.obj !== 'string')
            {
                return [];
            }
            let parsed: { outbounds?: Array<{ tag?: string; protocol?: string } | null> };
            try
            {
                parsed = JSON.parse(msg.obj);
            }
            catch
            {
                return [];
            }
            const tags = new Set<string>();
            for (const o of parsed.outbounds ?? [])
            {
                if (o?.tag && o.protocol !== 'blackhole')
                {
                    tags.add(o.tag);
                }
            }
            return Array.from(tags).sort();
        }
    });
}
