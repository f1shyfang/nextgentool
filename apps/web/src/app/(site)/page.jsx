import ReferencePage from "@/components/site/ReferencePage";
import routes from "../../../content/routes.json";

export default function Home() {
  return (
    <ReferencePage record={routes.find((record) => record.route === "/")} />
  );
}
