import { useQuery } from '@tanstack/react-query';

import { HttpUtil } from '@/utils';
import { keys } from '@/api/queryKeys';

// Fetch the outbound tags from the live Xray config so the node form can pick
// which egress outbound a node's bridge routes its panel API traffic through.
// POST /panel/xray/ returns a JSON STRING in `obj` that is a WRAPPER:
//   { xraySetting: {...config...}, inboundTags, subscriptionOutboundTags, ... }
// so the editable outbounds live at `xraySetting.outbounds` (NOT the top level),
// plus runtime subscription outbounds are surfaced separately. Blackhole
// outbounds are excluded since routing a node through one would drop its traffic.
export function useOutboundTags()
{
    return useQuery({
        queryKey: keys.xray.outboundTags(),
        staleTime: 60_000,
        queryFn: async (): Promise<string[]> =>
        {
            const msg = await HttpUtil.post('/panel/xray/', undefined, { silent: true });
            if (!msg?.success || typeof msg.obj !== 'string')
            {
                return [];
            }
            let parsed: {
              xraySetting?: { outbounds?: Array<{ tag?: string; protocol?: string } | null> };
              subscriptionOutboundTags?: string[];
            };
            try
            {
                parsed = JSON.parse(msg.obj);
            }
            catch
            {
                return [];
            }
            const tags = new Set<string>();
            for (const o of parsed.xraySetting?.outbounds ?? [])
            {
                if (o?.tag && o.protocol !== 'blackhole')
                {
                    tags.add(o.tag);
                }
            }
            // Runtime subscription outbounds (injected, not in the template) are
            // also valid egress targets for a node.
            for (const tag of parsed.subscriptionOutboundTags ?? [])
            {
                if (tag)
                {
                    tags.add(tag);
                }
            }
            return Array.from(tags).sort();
        }
    });
}
