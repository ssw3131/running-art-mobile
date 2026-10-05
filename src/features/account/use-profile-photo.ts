import { useEffect, useState } from 'react';
import { authClient } from '@/modules/auth/runtime';
import { PROFILE_PHOTO_BUCKET, profilePhotoPath } from '@/modules/account/photo';

export function useProfilePhoto(owner?: string, path?: string | null) {
  const [photo, setPhoto] = useState<{ owner: string; path: string; url: string } | null>(null);
  useEffect(() => {
    if (!authClient || !owner || !profilePhotoPath(owner, path)) return;
    let alive = true;
    const refresh = async () => {
      try {
        const { data, error } = await authClient!.storage.from(PROFILE_PHOTO_BUCKET).createSignedUrl(path!, 3600);
        if (alive) setPhoto(!error && data?.signedUrl ? { owner, path: path!, url: data.signedUrl } : null);
      } catch { if (alive) setPhoto(null); }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 50 * 60_000);
    return () => { alive = false; clearInterval(timer); };
  }, [owner, path]);
  return photo && photo.owner === owner && photo.path === path ? photo.url : null;
}
