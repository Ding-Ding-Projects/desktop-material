import type { Metadata } from 'next'
import { RemoteApp } from '../remote-app'

export const metadata: Metadata = {
  title: 'Connect',
  description:
    'Pair this browser with a Desktop Material agent using a one-time code or a private endpoint.',
}

export default function ConnectPage() {
  return <RemoteApp initialSurface="connect" />
}
