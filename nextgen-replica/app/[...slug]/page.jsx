import { notFound } from 'next/navigation';
import ReferencePage from '../../components/ReferencePage';
import routes from '../../content/routes.json';

export const dynamicParams = false;

export function generateStaticParams() {
  return routes.filter(record => record.route !== '/').map(record => ({ slug: record.route.slice(1).split('/') }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const record = routes.find(record => record.route === '/' + slug.join('/'));
  return { title: record?.title || 'NextGen Ventures' };
}

export default async function Page({ params }) {
  const { slug } = await params;
  const record = routes.find(record => record.route === '/' + slug.join('/'));
  if (!record) notFound();
  return <ReferencePage record={record} />;
}
