export function Mark({ size = 44 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Pace Register"
      className="shrink-0"
    >
      <rect width="64" height="64" rx="10" fill="var(--panel)" stroke="var(--rule)" strokeWidth="1" />
      <g fill="none" stroke="var(--indigo)" strokeWidth="3.2" strokeLinecap="round">
        <circle cx="32" cy="36" r="18" />
        <path d="M26 9h12" />
        <path d="M32 9v3.5" />
        <path d="M45.6 21.4l3.2-3.2" />
        <path d="M32 36.4l7-5.9" />
      </g>
      <g fill="var(--indigo)">
        <rect x="23.4" y="42.2" width="4.2" height="6" rx="1.2" />
        <rect x="30.4" y="38.4" width="4.2" height="9.8" rx="1.2" />
      </g>
      <rect x="37.4" y="34.2" width="4.2" height="14" rx="1.2" fill="var(--vermilion)" />
    </svg>
  );
}
