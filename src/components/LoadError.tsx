import { MONO } from '../theme';
import type { LoadErrorInfo } from '../api';

// First-load failure state — large enough to read from across a room, and
// leads with what's actually wrong (auth vs. server config vs. Linear being
// down) rather than a raw error string, since that's what determines whether
// someone standing in front of the screen can do anything about it.
export function LoadError({ error }: { error: LoadErrorInfo }) {
  return (
    <div
      style={{
        marginTop: '40px',
        padding: '20px 24px',
        borderRadius: '10px',
        background: 'rgba(229,72,77,.08)',
        border: '1px solid rgba(229,72,77,.25)',
        maxWidth: '560px',
      }}
    >
      <div style={{ fontSize: '20px', fontWeight: 700, color: '#E5484D', marginBottom: '8px' }}>
        {error.headline}
      </div>
      {error.detail && (
        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,.5)', fontFamily: MONO }}>
          {error.detail}
        </div>
      )}
    </div>
  );
}
