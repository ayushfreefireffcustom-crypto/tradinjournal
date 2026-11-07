'use client';

// One partner tool, for a client holding a package that includes it: the code or
// template text (with copy), the link, and the file download. Opening is counted
// so the partner sees which tools get used. Drawn like the Access page: a small
// window of the app the tool goes into, then the full content as a document.
import Link from '@/components/v6/ui/link';
import { use, useEffect, useState } from 'react';
import { DownloadSimple, LinkSimple } from '@phosphor-icons/react';
import AppShell from '@/components/app-shell';
import { useAccounts } from '@/lib/use-accounts';
import { ibApi, PRODUCT_TYPE_LABEL, type ClientProduct } from '@/lib/ib-api';
import { CopyButton } from '@/components/v6/account/partner-parts';
import { Caption, ToolPreview, Win } from '@/components/v6/account/access-art';
import { IArrowLeft } from '@/components/v6/icons';
import EmptyState from '@/components/v6/ui/empty-state';
import '@/styles/v6/account.css';
import '@/styles/v6/admin.css';
import '@/styles/v6/lux.css';
import '@/styles/v6/ib.css';
import '@/styles/v6/access.css';

export default function ToolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { accounts, selected, select } = useAccounts();
  const [t, setT] = useState<(ClientProduct & { content: string | null }) | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { ibApi.clientProduct(id).then(setT).catch(e => setError(e instanceof Error ? e.message : 'Could not open this tool.')); }, [id]);
  const first = t?.partner.split(' ')[0] ?? '';
  const lines = t?.content ? t.content.split('\n').length : 0;

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={select} pageTitle={t?.name ?? 'Tool'}
      pageSubtitle={<Link href="/access" className="ad-back"><IArrowLeft size={13} />Partner access</Link>}>
      <div className="x-page" data-testid="access-tool">
        {error && <EmptyState icon="lock" title="Not available">{error}</EmptyState>}
        {!t && !error && <div className="x-skel ac-sk-320" />}
        {t && <>
          <section className="x-card ax-hero2">
            <div>
              <span className="ax-kicker">From {t.partner}</span>
              <h2>{t.name}</h2>
              {t.description && <p className="ax-lede">{t.description}</p>}
              <ul className="ax-facts">
                <li><b>{PRODUCT_TYPE_LABEL[t.type]}</b></li>
                {t.platform && <li>for <b>{t.platform}</b></li>}
                <li>version <b>{t.version}</b></li>
                {t.fileName && <li><b>{t.fileName}</b>{t.fileSize ? ` · ${Math.ceil(t.fileSize / 1024)} KB` : ''}</li>}
              </ul>
              <div className="ax-tool-acts">
                {t.fileName && <a className="x-btn x-btn--hi" href={ibApi.clientProductFileUrl(t.id)} download data-testid="access-tool-download"><DownloadSimple size={15} weight="bold" />Download {t.fileName}</a>}
                {t.url && <a className={`x-btn ${t.fileName ? '' : 'x-btn--hi'}`} href={t.url} target="_blank" rel="noopener noreferrer nofollow"><LinkSimple size={15} weight="bold" />Open link</a>}
                {t.content && <CopyButton text={t.content} label={`Copy ${t.type === 'INDICATOR' ? 'code' : 'text'}`} className={`x-btn ${t.fileName || t.url ? '' : 'x-btn--hi'}`} />}
              </div>
            </div>
            <div>
              <ToolPreview name={t.name} platform={t.platform} content={t.content} fileName={t.fileName} url={t.url} isGuide={t.type === 'GUIDE'} />
              <Caption live>Reviewed by TRADElogs before {first} could share it</Caption>
            </div>
          </section>

          {t.content && (
            <Win title={`${t.name} · v${t.version}`} right={<span className="axnum">{lines} line{lines === 1 ? '' : 's'}</span>} className="axwin--path">
              <div className="axdoc"><ol className="axcode" data-testid="access-tool-content">{t.content.split('\n').map((l, i) => <li key={i}><span>{l || ' '}</span></li>)}</ol></div>
            </Win>
          )}
          <p className="ax-tool-foot">Shared by your partner for your own trading. It isn&rsquo;t financial advice.</p>
        </>}
      </div>
    </AppShell>
  );
}
