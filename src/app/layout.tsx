import type { Metadata } from 'next';
import { Press_Start_2P } from 'next/font/google';
import './globals.css';

const pixelFont = Press_Start_2P({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-pixel',
});

export const metadata: Metadata = {
  title: 'Garden Planner',
  description: 'Plan your perfect garden!',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={pixelFont.variable}>
      <body className="min-h-screen font-pixel">{children}</body>
    </html>
  );
}
