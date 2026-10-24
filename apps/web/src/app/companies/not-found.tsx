export default function CompanyNotFound() {
  return (
    <section className="ci-empty">
      <h1>Company not found</h1>
      <p>This profile may not exist, or it may belong to a different firm.</p>
      <a href="/companies/">Return to company directory</a>
    </section>
  );
}
