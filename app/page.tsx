import { redirect } from 'next/navigation';

// Root → Contacts (the hub, and the only live vertical in Phase 1).
export default function Home() {
  redirect('/contacts');
}
