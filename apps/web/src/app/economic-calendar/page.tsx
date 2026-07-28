// The economic calendar now lives inside the unified Markets page (as a vertical
// rail). This route stays as a permanent redirect so old links keep working.
import { redirect } from 'next/navigation';

export default function EconomicCalendarRedirect() {
  redirect('/markets');
}
