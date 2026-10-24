'use client';

import { useEffect, useRef, useState } from 'react';

const links = [
  { label: 'Team', href: '/our-team/' },
  { label: 'Startups', href: '/startups/' },
  { label: 'Our Writing', href: 'https://nextgenventuresaustralia.substack.com/' },
  { label: 'Careers', href: '/career/' },
];
const founders = 'https://airtable.com/apprKtt6W2e8YL9VK/shrrpokWlZGsD2TzH';

export default function Header({ route }) {
  const [open, setOpen] = useState(false);
  const header = useRef(null);
  const toggle = useRef(null);
  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') { setOpen(false); toggle.current?.focus(); }
    }
    function onPointer(event) {
      if (header.current && !header.current.contains(event.target)) setOpen(false);
    }
    if (open) {
      document.addEventListener('keydown', onKey);
      document.addEventListener('pointerdown', onPointer);
    }
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  return (
    <header ref={header} className={`replica-header${open ? ' is-open' : ''}`}>
      <div className="replica-header-inner">
        <a href="/" aria-label="NextGen Ventures home" className="replica-brand">
          <img src="/assets/nextgen-logo.svg" width="193" height="20" alt="NextGen Ventures" />
        </a>
        <button ref={toggle} className="replica-menu-toggle" type="button" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="site-navigation" onClick={() => setOpen(!open)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            {open ? <path d="m5 5 14 14M19 5 5 19" /> : <path d="M2 6h20M2 12h20M2 18h20" />}
          </svg>
        </button>
        <nav id="site-navigation" className="replica-navigation" aria-label="Main navigation">
          <div className="replica-nav-links">
            {links.map(link => <a key={link.href} href={link.href} aria-current={link.href === `${route}/` ? 'page' : undefined} onClick={() => setOpen(false)}>{link.label}</a>)}
          </div>
          <a className="replica-header-cta" href={founders} target="_blank" rel="noopener noreferrer">Founders - Get in touch</a>
        </nav>
      </div>
    </header>
  );
}
