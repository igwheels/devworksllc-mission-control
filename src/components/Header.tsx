import { MONO } from '../theme';
import type { HeaderStats } from '../board';
import markUrl from '../assets/devworks-mark.png';

const labelStyle: React.CSSProperties = {
  fontSize: '10px',
  letterSpacing: '.08em',
  color: 'rgba(255,255,255,.4)',
};
const valueStyle: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: '20px',
  fontWeight: 600,
};

export function Header({
  stats,
  syncedAgo,
  clockStr,
  stale,
}: {
  stats: HeaderStats;
  syncedAgo: string;
  clockStr: string;
  stale: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '20px',
        paddingBottom: '20px',
        borderBottom: '1px solid rgba(255,255,255,.09)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <img
          src={markUrl}
          alt="DevWorks"
          style={{ height: '30px', width: 'auto', flex: 'none' }}
        />
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '.02em' }}>
              MISSION CONTROL
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,.4)', fontFamily: MONO }}>
              DevWorks LLC
            </div>
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,.4)', marginTop: '4px' }}>
            {stats.projectCount} active {stats.projectCount === 1 ? 'project' : 'projects'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
        <div style={{ display: 'flex', gap: '22px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={labelStyle}>ISSUES OPEN</div>
            <div style={valueStyle}>{stats.open}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={labelStyle}>IN PROGRESS</div>
            <div style={{ ...valueStyle, color: '#4C8DFF' }}>{stats.inProgress}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={labelStyle}>AT RISK</div>
            <div style={{ ...valueStyle, color: '#F2884B' }}>{stats.atRisk}</div>
          </div>
        </div>

        <div style={{ width: '1px', height: '32px', background: 'rgba(255,255,255,.09)' }} />

        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '6px',
            }}
          >
            <div
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: stale ? '#F2884B' : '#33C48D',
                animation: 'mc-pulse 1.6s ease-in-out infinite',
              }}
            />
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,.45)' }}>
              {stale ? `sync failed ${syncedAgo}` : `synced ${syncedAgo}`}
            </div>
          </div>
          <div style={{ fontFamily: MONO, fontSize: '18px', fontWeight: 600, marginTop: '2px' }}>
            {clockStr}
          </div>
        </div>
      </div>
    </div>
  );
}
