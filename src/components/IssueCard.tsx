import { MONO } from '../theme';
import { subtaskStyle, type IssueVM } from '../board';

/** Linear issue code (e.g. `DEV-25`) — dim monospace, links to the issue in
 *  Linear when a URL is available. Stops click propagation so following the
 *  link doesn't also toggle the card's sub-task list. */
function IssueCode({
  code,
  url,
  size = 9.5,
  marginTop = 0,
}: {
  code: string;
  url: string;
  size?: number;
  marginTop?: number;
}) {
  if (!code) return null;
  const style: React.CSSProperties = {
    fontFamily: MONO,
    fontSize: `${size}px`,
    color: 'rgba(255,255,255,.4)',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    flex: 'none',
    marginTop: `${marginTop}px`,
  };
  if (!url) return <span style={style}>{code}</span>;
  return (
    <a
      className="mc-code"
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      style={style}
    >
      {code}
    </a>
  );
}

export function IssueCard({
  issue,
  expanded,
  onToggle,
}: {
  issue: IssueVM;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <div
        className="mc-issue"
        onClick={onToggle}
        style={{
          background: '#161c26',
          border: '1px solid rgba(255,255,255,.06)',
          borderRadius: '7px',
          padding: '9px 10px',
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <div
            style={{
              fontSize: '9px',
              fontWeight: 700,
              fontFamily: MONO,
              color: issue.priorityColor,
              flex: 'none',
              marginTop: '1px',
            }}
          >
            {issue.priorityLabel}
          </div>
          <IssueCode code={issue.code} url={issue.url} marginTop={1} />
          <div style={{ fontSize: '12.5px', lineHeight: 1.35, flex: 1 }}>{issue.title}</div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '8px',
          }}
        >
          <div
            style={{
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '8.5px',
              fontWeight: 600,
              color: 'rgba(255,255,255,.7)',
            }}
          >
            {issue.assignee}
          </div>
          {issue.hasSubtasks && (
            <div style={{ fontFamily: MONO, fontSize: '10px', color: 'rgba(255,255,255,.4)' }}>
              {issue.subtaskDone}/{issue.subtaskTotal}
            </div>
          )}
        </div>
      </div>

      {expanded && issue.subtasks.length > 0 && (
        <div
          style={{
            margin: '4px 0 0 14px',
            paddingLeft: '10px',
            borderLeft: '1px solid rgba(255,255,255,.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: '5px',
          }}
        >
          {issue.subtasks.map((st, i) => {
            const s = subtaskStyle(st.done);
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  fontSize: '11.5px',
                  color: s.textColor,
                }}
              >
                <div
                  style={{
                    width: '9px',
                    height: '9px',
                    borderRadius: '2px',
                    border: `1px solid ${s.boxColor}`,
                    background: s.boxBg,
                    flex: 'none',
                  }}
                />
                <IssueCode code={st.code} url={st.url} size={9} />
                <div style={{ textDecoration: s.strike }}>{st.title}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
