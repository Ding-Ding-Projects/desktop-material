import type { Metadata } from 'next'
import { RemoteApp } from './remote-app'

export const metadata: Metadata = {
  title: 'Repositories',
  description:
    'Securely manage Desktop Material repositories from your phone or desktop browser.',
}

export default function Home() {
  return <RemoteApp />
}
