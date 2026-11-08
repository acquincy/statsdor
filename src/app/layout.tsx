import type { Metadata } from 'next';
import Link from 'next/link';
import { Newsreader, Inter } from 'next/font/google';
import './globals.css';

const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'StatsDor — The Season in Motion',
  description: 'An editorial tracker of the best-performing footballers across the top 5 European leagues in 2026–27.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${newsreader.variable} ${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#111110] text-[#F1EFE8] font-sans selection:bg-[#C9A24B] selection:text-[#111110]">
        <header className="border-b border-[#2C2C2A] bg-[#111110]/95 sticky top-0 z-40 backdrop-blur-sm">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-baseline gap-3 group">
              <span className="font-serif text-2xl tracking-tight text-[#F1EFE8] group-hover:text-[#C9A24B] transition-colors">
                StatsDor
              </span>
              <span className="text-[11px] uppercase tracking-widest text-[#888780] font-sans">
                2026–27
              </span>
            </Link>

            <nav className="flex items-center gap-6 text-sm font-sans">
              <Link
                href="/"
                className="text-[#B4B2A9] hover:text-[#F1EFE8] transition-colors"
              >
                The race
              </Link>
              <Link
                href="/compare"
                className="text-[#B4B2A9] hover:text-[#F1EFE8] transition-colors"
              >
                Compare
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12">
          {children}
        </main>

        <footer className="border-t border-[#2C2C2A] py-8 mt-16 text-xs text-[#888780] font-sans">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-baseline justify-between gap-4">
            <div>
              <span className="text-[#B4B2A9]">StatsDor</span> · European top-5 leagues · 2026–27 season.
            </div>
            <div>
              Updated daily via ESPN match reports. All stats output-based.
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
