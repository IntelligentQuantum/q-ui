import { useMemo } from 'react';
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';

import { useTheme } from '@/hooks/useTheme';
import PageShell from '@/layouts/PageShell';
import './ApiDocsPage.css';

const basePath = window.Q_UI_BASE_PATH || '';
const openApiUrl = `${ basePath }panel/api/openapi.json`;

export default function ApiDocsPage()
{
    const { isDark, isUltra } = useTheme();

    const pageClass = useMemo(() =>
    {
        const classes = ['api-docs-page'];
        if (isDark)
        {
            classes.push('is-dark');
        }
        if (isUltra)
        {
            classes.push('is-ultra');
        }
        return classes.join(' ');
    }, [isDark, isUltra]);

    return (
    <PageShell name={pageClass}>
            <div className="docs-wrapper">
              <SwaggerUI
                url={openApiUrl}
                docExpansion="list"
                deepLinking={false}
                tryItOutEnabled
              />
            </div>
    </PageShell>
    );
}
