import './globals.css';

export const metadata = {
  title: 'NextGen Ventures - Backing Young Founders Before Anyone Else',
  description: 'A first-cheque venture fund backing young Australian founders before anyone else to build global unicorns.',
  robots: { index: false, follow: false },
  icons: { icon: '/assets/nextgen-logo.svg' },
};

const contract = '<!-- THESIS: Faithful recreation of the supplied NextGen Ventures website. OWN-WORLD: Original navy, blue, Space Grotesk and Urbanist typography, photographs and poppies. STORY: Discover the fund, meet the team, explore startups and follow the original enquiry links. FIRST VIEWPORT: Original responsive headline, paired enquiry actions and two continuously moving photo strips. FORM: User-pinned reference, code directly against the original. FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance -->';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div hidden dangerouslySetInnerHTML={{ __html: contract }} />
        <a className="replica-skip" href="#replica-content">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
