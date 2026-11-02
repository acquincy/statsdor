import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { Activity, BarChart3, GitCompare, Trophy } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Statsdor | Football Player Stats & Analytics',
  description: 'Live cumulative season totals, xG, and per-90 metrics for Premier League football players.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100 selection:bg-emerald-500 selection:text-slate-950">
        <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">
                <Activity className="w-5 h-5 font-bold stroke-[2.5]" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                  Statsdor
                </span>
                <span className="text-[10px] text-emerald-400 font-medium tracking-wider uppercase -mt-1">
                  Premier League
                </span>
              </div>
            </Link>

            <nav className="flex items-center gap-1 sm:gap-2">
              <Link
                href="/"
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-slate-200 hover:text-white hover:bg-slate-800/60 transition-colors"
              >
                <Trophy className="w-4 h-4 text-emerald-400" />
                <span>Leaderboard</span>
              </Link>
              <Link
                href="/compare"
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-slate-200 hover:text-white hover:bg-slate-800/60 transition-colors"
              >
                <GitCompare className="w-4 h-4 text-teal-400" />
                <span>Compare</span>
              </Link>
              <a
                href="https://github.com/acquincy/statsdor"
                target="_blank"
                rel="noreferrer"
                className="hidden sm:flex items-center gap-2 ml-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 transition"
              >
                GitHub
              </a>
            </nav>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>

        <footer className="border-t border-slate-900 bg-slate-950/60 py-6 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p>Statsdor • Built for football performance tracking</p>
            <p className="text-slate-600">Seasons 2026 (Current) & 2025</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
