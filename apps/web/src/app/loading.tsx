// Route-level loading UI — shown automatically while a route segment loads.
import { LoadingScreen } from '@/components/loader';

export default function Loading() {
  return (
    <div className="h-dvh bg-app">
      <LoadingScreen />
    </div>
  );
}
