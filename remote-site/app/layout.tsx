import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: {
    default: 'Desktop Material Remote',
    template: '%s · Desktop Material Remote',
  },
  description:
    'A private, touch-first remote control for Desktop Material repositories.',
  applicationName: 'Desktop Material Remote',
  referrer: 'no-referrer',
  openGraph: {
    type: 'website',
    title: 'Desktop Material Remote',
    description:
      'Secure, touch-first repository control for your Desktop Material machine.',
    images: [
      {
        url: '/desktop-material-remote-social.png',
        width: 1731,
        height: 909,
        alt: 'Desktop and mobile repository dashboards connected through secure QR pairing',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Desktop Material Remote',
    description:
      'Secure, touch-first repository control for your Desktop Material machine.',
    images: ['/desktop-material-remote-social.png'],
  },
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f9f7ff' },
    { media: '(prefers-color-scheme: dark)', color: '#121318' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  )
}
