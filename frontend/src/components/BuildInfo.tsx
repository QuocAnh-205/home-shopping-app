'use client';

import { faCodeCommit } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect, useState } from 'react';

interface Info {
  version: string;
  commit: string;
  release: string | null;
  environment: string;
  commitUrl: string | null;
}

const ENV_LABEL: Record<string, string> = { production: 'Production', staging: 'Staging', development: 'Local' };

/**
 * "v1.0.42 · build #a1b2c3d (Production)" – đọc từ /api/health/version của backend đang chạy.
 * Mỗi lần pipeline deploy xong, số phiên bản và commit tự đổi → đối chiếu được với commit mới nhất trên GitHub.
 */
export function BuildInfo() {
  const [info, setInfo] = useState<Info | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/health/version', { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Info | null) => d && setInfo(d))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, []);

  if (!info) return null;
  const label = `${info.release ? `v${info.release}` : 'dev'} · build #${info.commit} (${ENV_LABEL[info.environment] ?? info.environment})`;
  return (
    <span className={`build-info env-${info.environment}`} title={`Commit ${info.version}`}>
      <FontAwesomeIcon icon={faCodeCommit} />{' '}
      {info.commitUrl ? (
        <a href={info.commitUrl} target="_blank" rel="noopener noreferrer">
          {label}
        </a>
      ) : (
        label
      )}
    </span>
  );
}
