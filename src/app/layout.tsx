import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AutoEbook - AI-Powered Ebook Generator',
  description: 'Generate professional ebooks with AI-powered illustrations and formatting',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
