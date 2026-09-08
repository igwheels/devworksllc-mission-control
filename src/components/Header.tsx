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
  onHome,
  includeInactive,
  onToggleIncludeInactive,
}: {
  stats: HeaderStats;
  syncedAgo: string;
  clockStr: string;
  stale: boolean;
  /** Return to the overview grid. A no-op when already there. */
  onHome: () => void;
  /** "Include Inactive" (DEV-77) — off shows active projects only, on shows
   *  active + inactive together. */
  includeInactive: boolean;
  onToggleIncludeInactive: () => void;
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
        {/* Also a home link (DEV-76), same destination as the "MISSION
            CONTROL" wordmark below. Deliberately NOT a second focusable/
            announced control: no role or tabIndex, and aria-hidden + empty
            alt keep it out of the accessibility tree entirely, so keyboard
            and screen-reader users still see exactly one "back to overview"
            control (the wordmark) rather than two redundant ones pointing
            at the same place. Pointer/touch users get both as click targets. */}
        <img
          src={markUrl}
          alt=""
          aria-hidden="true"
          onClick={onHome}
          title="Back to overview"
          style={{ height: '30px', width: 'auto', flex: 'none', cursor: 'pointer' }}
        />
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <div
              className="mc-home"
              role="button"
              tabIndex={0}
              onClick={onHome}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onHome();
                }
              }}
              title="Back to overview"
              style={{
                fontSize: '22px',
                fontWeight: 700,
                letterSpacing: '.02em',
                cursor: 'pointer',
              }}
            >
              MISSION CONTROL
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,.4)', fontFamily: MONO }}>
              DevWorks LLC
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              marginTop: '4px',
            }}
          >
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,.4)' }}>
              {stats.activeCount} active {stats.activeCount === 1 ? 'project' : 'projects'}
              {includeInactive && stats.inactiveCount > 0
                ? `, ${stats.inactiveCount} inactive`
                : ''}
            </div>
            {/* Custom switch rather than a native checkbox — standard slider
                affordance, matching the dashboard's design language, and
                sized to stay legible at wall-display distance rather than a
                checkbox's small hit target. role="switch" + aria-checked
                keeps it a real toggle to assistive tech, same accessible-
                custom-control pattern as the "MISSION CONTROL" home link
                above (.mc-home): one div, tabIndex + onClick + onKeyDown for
                Enter/Space, no separate hidden native input needed. */}
            <div
              className="mc-switch"
              role="switch"
              aria-checked={includeInactive}
              tabIndex={0}
              onClick={onToggleIncludeInactive}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onToggleIncludeInactive();
                }
              }}
              title="Show completed projects alongside active ones"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '11px',
                color: 'rgba(255,255,255,.4)',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  width: '34px',
                  height: '19px',
                  borderRadius: '999px',
                  flex: 'none',
                  position: 'relative',
                  background: includeInactive ? '#4C8DFF' : 'rgba(255,255,255,.16)',
                  transition: 'background .15s',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: '2px',
                    left: includeInactive ? '17px' : '2px',
                    width: '15px',
                    height: '15px',
                    borderRadius: '50%',
                    background: '#fff',
                    transition: 'left .15s',
                  }}
                />
              </div>
              Include Inactive
            </div>
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
