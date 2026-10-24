import { auth, currentUser } from "@clerk/nextjs/server";
import { clerkPublishableKey } from "@repo/env/client";
import { redirect } from "next/navigation";
import Header from "@/components/site/Header";

export const metadata = { title: "Dashboard | NextGen Ventures" };

const destinations = [
  {
    title: "Explore our startups",
    description: "Meet the companies building what comes next.",
    href: "/startups/",
    action: "Explore startups",
  },
  {
    title: "Meet the team",
    description: "Get to know the people behind NextGen Ventures.",
    href: "/our-team/",
    action: "Meet the team",
  },
  {
    title: "Read our latest thinking",
    description: "Explore ideas and perspectives from NextGen.",
    href: "https://nextgenventuresaustralia.substack.com/",
    action: "Read our writing",
  },
];

export default async function DashboardPage() {
  if (!clerkPublishableKey) redirect("/sign-in/");
  await auth.protect();
  const user = await currentUser();
  const name = user?.firstName;
  return (
    <div className="portal-page">
      <Header route="/dashboard" />
      <main id="replica-content" className="dashboard-main">
        <div className="dashboard-welcome">
          <h1>{name ? `Welcome, ${name}.` : "Welcome to NextGen."}</h1>
          <p>Your home for exploring the NextGen community.</p>
        </div>
        <section className="dashboard-explore" aria-labelledby="explore-title">
          <h2 id="explore-title">Make your next connection.</h2>
          <div className="dashboard-destinations">
            {destinations.map((item) => (
              <a
                className="dashboard-destination"
                key={item.href}
                href={item.href}
                {...(item.href.startsWith("https:")
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              >
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
                <span className="dashboard-destination-action">
                  {item.action}
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <path d="M4 12h15m-6-6 6 6-6 6" />
                  </svg>
                </span>
              </a>
            ))}
          </div>
        </section>
        <aside className="dashboard-account">
          <h2>Your account</h2>
          <p>
            Use your profile icon in the navigation to manage your account,
            update security settings, or sign out.
          </p>
        </aside>
      </main>
      <footer className="portal-footer">NextGen Ventures Aus Pty Ltd</footer>
    </div>
  );
}
