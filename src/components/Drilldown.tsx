import { MONO } from '../theme';
import type { ProjectVM } from '../board';
import { KanbanColumn } from './KanbanColumn';

export function Drilldown({
  project,
  onClose,
  expandedIssueId,
  onToggleIssue,
}: {
  project: ProjectVM;
  onClose: () => void;
  expandedIssueId: string | null;
  onToggleIssue: (id: string) => void;
}) {
  return (
    <div style={{ marginTop: '20px', animation: 'mc-fadein .2s ease-out' }}>
      <div
        className="mc-back"
        onClick={onClose}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '12px',
          color: 'rgba(255,255,255,.5)',
          cursor: 'pointer',
          marginBottom: '18px',
        }}
      >
        ← All Projects
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
        <div
          style={{ width: '12px', height: '12px', borderRadius: '50%', background: project.dotColor }}
        />
        <div style={{ fontSize: '22px', fontWeight: 700 }}>{project.name}</div>
        <div
          style={{
            fontSize: '10px',
            fontWeight: 600,
            letterSpacing: '.04em',
            padding: '3px 9px',
            borderRadius: '20px',
            background: project.health.bg,
            color: project.health.color,
          }}
        >
          {project.health.label}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          color: 'rgba(255,255,255,.45)',
          fontSize: '12px',
          marginBottom: '18px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            style={{
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '9px',
              fontWeight: 600,
              color: 'rgba(255,255,255,.7)',
            }}
          >
            {project.lead}
          </div>
          lead
        </div>
        <div>Target {project.target || '—'}</div>
        <div>{project.totalIssues} issues</div>
        <div
          style={{
            flex: 1,
            maxWidth: '220px',
            height: '6px',
            borderRadius: '4px',
            background: 'rgba(255,255,255,.08)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              background: project.dotColor,
              width: `${project.progressPct}%`,
            }}
          />
        </div>
        <div style={{ fontFamily: MONO, color: '#E7E9EE' }}>{project.progressPct}%</div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5,minmax(200px,1fr))',
          gap: '14px',
          overflowX: 'auto',
        }}
      >
        {project.columns.map((col) => (
          <KanbanColumn
            key={col.status}
            column={col}
            expandedIssueId={expandedIssueId}
            onToggleIssue={onToggleIssue}
          />
        ))}
      </div>
    </div>
  );
}
