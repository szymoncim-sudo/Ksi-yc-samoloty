import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...p,
});

/** Brand mark: the lunar disc crossed by an aircraft's chord. */
export const Logo = (p: P) => (
  <svg viewBox="0 0 24 24" fill="none" {...p}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
    <path d="M12 3a9 9 0 0 1 0 18" fill="currentColor" />
    <path d="M1.5 15.5 22.5 8.5" stroke="#000" strokeWidth="3.2" />
    <path d="M1.5 15.5 22.5 8.5" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

export const IMoon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.25" />
    <path d="M12 3.75a8.25 8.25 0 0 1 0 16.5c-2.4-2-3.8-5-3.8-8.25S9.6 5.75 12 3.75Z" fill="currentColor" stroke="none" />
  </svg>
);

export const ITransit = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="6.5" />
    <path d="M2.5 16 21.5 8" />
    <path d="m17.5 6.8 4 1.2-2.2 3.6" />
  </svg>
);

export const IPin = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 21s-6.5-5.7-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 15.3 12 21 12 21Z" />
    <circle cx="12" cy="9.8" r="2.2" />
  </svg>
);

export const ISliders = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
    <path d="M14 4.5v5M6 14.5v5" />
    <path d="M14 7h4M6 17h4" opacity={0} />
  </svg>
);

export const IChevronDown = (p: P) => (
  <svg {...base(p)}>
    <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />
  </svg>
);

export const IChevronLeft = (p: P) => (
  <svg {...base(p)}>
    <path d="M14.5 6 8.5 12l6 6" />
  </svg>
);

export const IChevronRight = (p: P) => (
  <svg {...base(p)}>
    <path d="m9.5 6 6 6-6 6" />
  </svg>
);

export const IArrowRight = (p: P) => (
  <svg {...base(p)}>
    <path d="M4.5 12h15M14 6.5l5.5 5.5-5.5 5.5" />
  </svg>
);

export const IClose = (p: P) => (
  <svg {...base(p)}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

export const IPlus = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IMinus = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 12h14" />
  </svg>
);

export const ILocate = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="6" />
    <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" />
  </svg>
);

export const ILayers = (p: P) => (
  <svg {...base(p)}>
    <path d="m12 4 8.5 4.5L12 13 3.5 8.5 12 4Z" />
    <path d="m3.5 12.5 8.5 4.5 8.5-4.5" />
    <path d="m3.5 16.5 8.5 4.5 8.5-4.5" />
  </svg>
);

export const IBands = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 18 21 6M3 13.5 15.5 5.2M8.5 19 21 10.6" />
  </svg>
);

export const IRefresh = (p: P) => (
  <svg {...base(p)}>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
    <path d="M19.5 4.5v4h-4" />
  </svg>
);

export const ISearch = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.3-4.3" />
  </svg>
);

export const IPlay = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 5.5v13L18.5 12 8 5.5Z" fill="currentColor" />
  </svg>
);

export const IPause = (p: P) => (
  <svg {...base(p)}>
    <path d="M8.5 5.5v13M15.5 5.5v13" strokeWidth={2.6} strokeLinecap="butt" />
  </svg>
);

export const IExpand = (p: P) => (
  <svg {...base(p)}>
    <path d="M4.5 9.5v-5h5M19.5 9.5v-5h-5M4.5 14.5v5h5M19.5 14.5v5h-5" />
  </svg>
);

export const IReset = (p: P) => (
  <svg {...base(p)}>
    <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
    <path d="M4.5 4.5v4h4" />
  </svg>
);

export const ITag = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 12.4V4.8a.8.8 0 0 1 .8-.8h7.6l7.6 7.6-8.4 8.4L4 12.4Z" />
    <circle cx="8.5" cy="8.5" r="1.3" />
  </svg>
);

export const ISun = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3.8" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
  </svg>
);

export const IEclipse = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.25" />
    <circle cx="15" cy="12" r="6" fill="currentColor" fillOpacity={0.5} stroke="none" />
  </svg>
);

export const IPerigee = (p: P) => (
  <svg {...base(p)}>
    <circle cx="7" cy="12" r="2.5" />
    <ellipse cx="12" cy="12" rx="9" ry="5.5" />
    <circle cx="21" cy="12" r="1.2" fill="currentColor" />
  </svg>
);

export const IApogee = (p: P) => (
  <svg {...base(p)}>
    <circle cx="17" cy="12" r="2.5" />
    <ellipse cx="12" cy="12" rx="9" ry="5.5" />
    <circle cx="3" cy="12" r="1.2" fill="currentColor" />
  </svg>
);

export const ITrash = (p: P) => (
  <svg {...base(p)}>
    <path d="M4.5 7h15M9.5 7V5h5v2M6.5 7l.9 12.2a1 1 0 0 0 1 .8h7.2a1 1 0 0 0 1-.8L17.5 7" />
  </svg>
);

export const IShare = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3.5v11M7.5 8 12 3.5 16.5 8M6.5 11.5h-1v8h13v-8h-1" />
  </svg>
);
