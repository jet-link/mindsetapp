import ProfileHeader from "./profile-header";
import ProfileActions from "./profile-actions";
import ProfileHead from "./profile-head";
import ProfileTabs from "./profile-tabs";
import { getProfile } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  let profile;
  try {
    profile = await getProfile(username);
  } catch {
    return <p className="muted">User not found or the API is unavailable.</p>;
  }

  return (
    <main>
      <ProfileHeader username={profile.username} />
      <ProfileHead
        username={profile.username}
        initialBio={profile.bio}
        initialAvatar={profile.avatar}
        followers={profile.followers_count}
        following={profile.following_count}
      />

      <ProfileActions username={profile.username} initialFollowing={profile.is_following} />
      <ProfileTabs
        username={profile.username}
        counts={{
          themes: profile.themes_count,
          replies: profile.replies_count,
          media: profile.media_count,
          reposts: profile.reposts_count,
        }}
      />
    </main>
  );
}
