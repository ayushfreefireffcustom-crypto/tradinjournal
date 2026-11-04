'use client';

// One partner tool, for a client holding a package that includes it: the code or
// template text (with copy), the link, and the file download. Opening is counted
// so the partner sees which tools get used.
import Link from '@/components/v6/ui/link';
import { use, useEffect, useState } from 'react';
import { DownloadSimple, LinkSimple } from '@phosphor-icons/react';
import AppShell from '@/components/app-shell';
import { useAccounts } from '@/lib/use-accounts';
import { ibApi, PRODUCT_TYPE_LABEL, type ClientProduct } from '@/lib/ib-api';
import { CopyButton } from '@/components/v6/account/partner-parts';
import { IArrowLeft } from '@/components/v6/icons';
import EmptyState from '@/components/v6/ui/empty-state';
import '@/styles/v6/account.css';
import '@/styles/v6/admin.css';
import '@/styles/v6/lux.css';
import '@/styles/v6/ib.css';

export default function ToolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { accounts, selected, select } = useAccounts();
  const [t, setT] = useState<(ClientProduct & { content: string | null }) | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { ibApi.clientProduct(id).then(setT).catch(e => setError(e instanceof Error ? e.message : 'Could not open this tool.')); }, [id]);

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={select} pageTitle={t?.name ?? 'Tool'}
      pageSubtitle={<Link href="/access" className="ad-back"><IArrowLeft size={13} />Partner access</Link>}>
      <div className="x-page" data-testid="access-tool">
        {error && <EmptyState icon="lock" title="Not available">{error}</EmptyState>}
        {!t && !error && <div className="x-skel ac-sk-320" />}
        {t && (
          <section className="x-card ib-app">
            <div className="x-ch"><h2>{t.name}</h2><span className="x-sub">{PRODUCT_TYPE_LABEL[t.type]}{t.platform ? ` · ${t.platform}` : ''} · v{t.version} · from {t.partner}</span></div>
            {t.description && <p className="ac-p">{t.description}</p>}
            <div className="ib-acct-f">
              {t.fileName && <a className="x-btn x-btn--hi" href={ibApi.clientProductFileUrl(t.id)} download data-testid="access-tool-download"><DownloadSimple size={15} weight="bold" />Download {t.fileName}</a>}
              {t.url && <a className="x-btn" href={t.url} target="_blank" rel="noopener noreferrer nofollow"><LinkSimple size={15} weight="bold" />Open link</a>}
              {t.content && <CopyButton text={t.content} label="Copy" className="x-btn" />}
            </div>
            {t.content && <pre className="ib-pre" data-testid="access-tool-content">{t.content}</pre>}
            <p className="ib-note">Shared by your partner for your own trading. Reviewed by TRADElogs before release; it isn&rsquo;t financial advice.</p>
          </section>
        )}
      </div>
    </AppShell>
  );
}
