// The notebook is now the Notes view of Journal (A0.D1). Old links and
// bookmarks land there.
import { permanentRedirect } from 'next/navigation';

export default function NotebookRedirect() {
  permanentRedirect('/journal?view=notes');
}
