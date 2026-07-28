// News + Economic Calendar were merged into the unified Markets page. This route
// stays as a permanent redirect so old links/bookmarks keep working.
import { redirect } from 'next/navigation';

export default function NewsRedirect() {
  redirect('/markets');
}
