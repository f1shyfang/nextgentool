import Image from "next/image";

export default function AuthShell({ mode, children }) {
  const signingUp = mode === "sign-up";
  return (
    <div className="portal-page">
      <header className="portal-header">
        <a href="/" aria-label="NextGen Ventures home">
          <Image
            src="/assets/nextgen-logo.svg"
            width={193}
            height={20}
            alt="NextGen Ventures"
            loading="eager"
            unoptimized
          />
        </a>
        <a href="/" className="portal-back">
          Back to website
        </a>
      </header>
      <main id="replica-content" className="auth-layout">
        <div className="auth-intro">
          <h1>
            {signingUp
              ? "Your next chapter starts here."
              : "Welcome back to NextGen."}
          </h1>
          <p>
            {signingUp
              ? "Create your account and find your place in the next generation of founders and investors."
              : "Log in to your dashboard and reconnect with the NextGen community."}
          </p>
          <div className="auth-note">
            <span className="auth-note-line" />
            <p>For the next generation of believers, doers, and go-getters.</p>
          </div>
        </div>
        <div className="auth-form">{children}</div>
      </main>
      <footer className="portal-footer">NextGen Ventures Aus Pty Ltd</footer>
    </div>
  );
}
