import { MONO } from '../theme';
import type { ColumnVM } from '../board';
import { IssueCard } from './IssueCard';

export function KanbanColumn({
  column,
  expandedIssueId,
  onToggleIssue,
}: {
  column: ColumnVM;
  expandedIssueId: string | null;
  onToggleIssue: (id: string) => void;
}) {
  return (
    <div
      style={{
        background: '#10151d',
        border: '1px solid rgba(255,255,255,.07)',
        borderRadius: '10px',
        padding: '12px',
        minHeight: '120px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          marginBottom: '12px',
          paddingBottom: '10px',
          borderBottom: '1px solid rgba(255,255,255,.06)',
        }}
      >
        <div
          style={{ width: '7px', height: '7px', borderRadius: '50%', background: column.color }}
        />
        <div
          style={{
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '.03em',
            color: 'rgba(255,255,255,.7)',
            flex: 1,
          }}
        >
          {column.label}
        </div>
        <div style={{ fontFamily: MONO, fontSize: '11px', color: 'rgba(255,255,255,.4)' }}>
          {column.issues.length}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {column.issues.map((iss) => (
          <IssueCard
            key={iss.id}
            issue={iss}
            expanded={expandedIssueId === iss.id}
            onToggle={() => onToggleIssue(iss.id)}
          />
        ))}
      </div>
    </div>
  );
}
