// Placeholder grid shown before the first board ever loads. Blocky and
// synchronized rather than a shimmering gradient — this runs on a wall
// display meant to be read from across a room, so legibility beats motion.
const block: React.CSSProperties = {
  background: 'rgba(255,255,255,.07)',
  borderRadius: '5px',
  animation: 'mc-pulse 1.8s ease-in-out infinite',
};

function SkeletonCard() {
  return (
    <div
      style={{
        background: '#121821',
        border: '1px solid rgba(255,255,255,.08)',
        borderRadius: '10px',
        padding: '16px 18px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <div style={{ ...block, width: '9px', height: '9px', borderRadius: '50%' }} />
        <div style={{ ...block, height: '15px', width: '55%' }} />
        <div style={{ ...block, height: '18px', width: '64px', borderRadius: '20px', marginLeft: 'auto' }} />
      </div>
      <div style={{ ...block, height: '10px', width: '30%', marginBottom: '10px' }} />
      <div style={{ ...block, height: '6px', width: '100%', marginBottom: '12px' }} />
      <div style={{ ...block, height: '5px', width: '100%', marginBottom: '14px' }} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: '12px',
          borderTop: '1px solid rgba(255,255,255,.07)',
        }}
      >
        <div style={{ ...block, height: '22px', width: '90px', borderRadius: '11px' }} />
        <div style={{ ...block, height: '11px', width: '50px' }} />
      </div>
    </div>
  );
}

export function BoardSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading Mission Control data"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))',
        gap: '16px',
        marginTop: '22px',
      }}
    >
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}
