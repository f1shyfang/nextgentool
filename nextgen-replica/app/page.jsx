import ReferencePage from '../components/ReferencePage';
import routes from '../content/routes.json';

export default function Home() {
  return <ReferencePage record={routes.find(record => record.route === '/')} />;
}
