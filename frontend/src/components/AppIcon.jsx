const paths = {
  dashboard: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v10h13V10M9 20v-6h6v6" /></>,
  movements: <><path d="M4 7h14M14 3l4 4-4 4" /><path d="M20 17H6M10 13l-4 4 4 4" /></>,
  registry: <><path d="M4 6.5h6l2 2h8v11H4z" /><path d="M4 6.5V4h6l2 2" /></>,
  reports: <><path d="M5 20V10M12 20V4M19 20v-7" /><path d="M3 20h18" /></>,
  recurring: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 5v6h-6M12 8v4l3 2" /></>,
  users: <><path d="M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-4A4.5 4.5 0 0 0 3 18.5V20" /><circle cx="9.5" cy="7" r="3.5" /><path d="M17 11a3 3 0 1 0 0-6M21 20v-1.5a4.5 4.5 0 0 0-3-4.2" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
  roadmap: <><path d="M4 5.5 9 3l6 2.5L20 3v15.5L15 21l-6-2.5L4 21z" /><path d="M9 3v15.5M15 5.5V21" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  logout: <><path d="M10 5H5v14h5M14 8l4 4-4 4M9 12h9" /></>,
  chevron: <path d="m8 10 4 4 4-4" />,
};

const AppIcon = ({ name, size = 20, className = '' }) => (
  <svg aria-hidden="true" className={`app-icon ${className}`.trim()} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {paths[name] || paths.menu}
  </svg>
);

export default AppIcon;
