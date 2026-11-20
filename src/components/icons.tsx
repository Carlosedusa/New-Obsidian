import type { SVGProps } from 'react';

const base = (d: string) => (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
    <path d={d} />
  </svg>
);

export const IconNotes = base('M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5');
export const IconBrain = base('M12 5a3 3 0 0 0-5.6-1.5A3 3 0 0 0 4 8a3 3 0 0 0 0 5 3 3 0 0 0 3 5 3 3 0 0 0 5 1.5M12 5a3 3 0 0 1 5.6-1.5A3 3 0 0 1 20 8a3 3 0 0 1 0 5 3 3 0 0 1-3 5 3 3 0 0 1-5 1.5M12 5v14.5');
export const IconEdit = base('M4 20h4L19 9l-4-4L4 16zM14 6l4 4');
export const IconEye = base('M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z');
export const IconPlus = base('M12 5v14M5 12h14');
export const IconSearch = base('M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4');
export const IconGear = base('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z');
export const IconBack = base('M15 18l-6-6 6-6');
export const IconClose = base('M6 6l12 12M18 6L6 18');
export const IconShare = base('M12 3v13M7 8l5-5 5 5M5 14v6h14v-6');
export const IconTrash = base('M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13');
export const IconImport = base('M12 16V3M7 11l5 5 5-5M5 20h14');
export const IconZoomIn = base('M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4M8 11h6M11 8v6');
export const IconZoomOut = base('M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4M8 11h6');
export const IconFit = base('M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5');
export const IconNewNote = base('M12 20h9M4 20h4L19 9l-4-4L4 16zM14 6l4 4');
export const IconFolderPlus = base('M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 10v6M9 13h6');
export const IconSort = base('M4 6h10M4 12h7M4 18h4M17 4v16M14 17l3 3 3-3');
export const IconCollapse = base('M7 4l5 5 5-5M7 20l5-5 5 5');
export const IconChevron = base('M9 6l6 6-6 6');
export const IconMore = base('M5 12h.01M12 12h.01M19 12h.01');
export const IconFolder = base('M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z');
