import type { ReactNode } from "react";
import "./site.css";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="nextgen-site">
      <a className="replica-skip" href="#replica-content">
        Skip to content
      </a>
      {children}
    </div>
  );
}
