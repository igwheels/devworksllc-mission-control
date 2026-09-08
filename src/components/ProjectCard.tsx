import { MONO, GRAY2 } from '../theme';
import type { ProjectVM } from '../board';

export function ProjectCard({ project, onOpen }: { project: ProjectVM; onOpen: () => void }) {
  return (
    <div
      className="mc-card"
      onClick={onOpen}
      style={{
        background: '#121821',
        border: '1px solid rgba(255,255,255,.08)',
        borderRadius: '10px',
        padding: '16px 18px',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <div
          style={{
            width: '9px',
            height: '9px',
            borderRadius: '50%',
            background: project.dotColor,
            flex: 'none',
          }}
        />
        <div
          style={{
            fontSize: '15px',
            fontWeight: 600,
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {project.name}
        </div>
        {/* Shown only via "Include Inactive" (DEV-77) — a completed/canceled
            project's own health badge can otherwise read misleadingly (it
            wasn't designed with inactive projects in mind), so this is a
            separate, unambiguous cue that the project isn't actually being
            tracked anymore. Not something the issue's decisions explicitly
            called for; added because showing inactive projects with zero
            visual distinction from active ones seemed hard to make sense of. */}
        {!project.active && (
          <div
            style={{
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '.04em',
              padding: '3px 8px',
              borderRadius: '20px',
              background: 'rgba(139,146,165,.14)',
              color: GRAY2,
              flex: 'none',
            }}
          >
            INACTIVE
          </div>
        )}
        <div
          style={{
            fontSize: '10px',
            fontWeight: 600,
            letterSpacing: '.04em',
            padding: '3px 8px',
            borderRadius: '20px',
            background: project.health.bg,
            color: project.health.color,
            flex: 'none',
          }}
        >
          {project.health.label}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: '6px',
        }}
      >
        <div style={{ fontSize: '10px', letterSpacing: '.06em', color: 'rgba(255,255,255,.4)' }}>
          PROGRESS
        </div>
        <div style={{ fontFamily: MONO, fontSize: '13px', fontWeight: 600 }}>
          {project.progressPct}%
        </div>
      </div>
      <div
        style={{
          height: '6px',
          borderRadius: '4px',
          background: 'rgba(255,255,255,.08)',
          overflow: 'hidden',
          marginBottom: '12px',
        }}
      >
        <div
          style={{
            height: '100%',
            borderRadius: '4px',
            background: project.dotColor,
            width: `${project.progressPct}%`,
            transition: 'width .4s',
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          height: '5px',
          borderRadius: '3px',
          overflow: 'hidden',
          marginBottom: '8px',
          gap: '1px',
        }}
      >
        {project.segments.map((seg, i) => (
          <div key={i} style={{ height: '100%', background: seg.color, width: `${seg.pct}%` }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
        {project.legend.map((lg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '11px',
              color: 'rgba(255,255,255,.5)',
            }}
          >
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: lg.color }} />
            <span style={{ fontFamily: MONO }}>{lg.count}</span> {lg.label}
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: '12px',
          borderTop: '1px solid rgba(255,255,255,.07)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '22px',
              height: '22px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '10px',
              fontWeight: 600,
              color: 'rgba(255,255,255,.7)',
            }}
          >
            {project.lead}
          </div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,.4)' }}>
            Target {project.target || '—'}
          </div>
        </div>
        <div
          style={{
            fontSize: '11px',
            color: 'rgba(255,255,255,.4)',
            fontFamily: MONO,
          }}
        >
          {project.totalIssues} issues
        </div>
      </div>
    </div>
  );
}
